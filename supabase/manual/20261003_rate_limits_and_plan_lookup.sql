-- Run once in the Supabase SQL editor of the client project (after setup_client_project.sql).
-- Same content as supabase/migrations/20261003000001_rate_limits_and_plan_lookup.sql, plus the CLI migration record.

begin;

-- Shared rate limiter (replaces the per-instance in-memory counter, which does not hold
-- across serverless instances) and a fast "is this plan live" check used by proxy.ts to
-- return a real 404 status for withdrawn or unknown plan URLs.
-- Both are callable by the service role only.

create table public.rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);

alter table public.rate_limits enable row level security;
-- No policies: only the security-definer function below touches this table.

create index rate_limits_reset_at_idx on public.rate_limits (reset_at);

-- Fixed-window counter. Returns true when the call is allowed, false once the key has
-- used up its limit inside the current window. Atomic under concurrent calls.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as r (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count = case when r.reset_at <= now() then 1 else r.count + 1 end,
        reset_at = case when r.reset_at <= now() then now() + make_interval(secs => p_window_seconds) else r.reset_at end
  returning count into v_count;

  -- Opportunistic cleanup so the table stays small without a cron job.
  if random() < 0.01 then
    delete from public.rate_limits where reset_at < now() - interval '1 hour';
  end if;

  return v_count <= p_limit;
end;
$$;

-- Same visibility rule as the public catalogue: plan published, carrier active,
-- at least one active day package.
create or replace function public.plan_is_live(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plans p
    join public.carriers c on c.id = p.carrier_id
    where p.slug = p_slug
      and p.published
      and c.active
      and exists (select 1 from public.day_packages d where d.plan_id = p.id and d.active)
  );
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.plan_is_live(text) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.plan_is_live(text) to service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261003000001', 'rate_limits_and_plan_lookup')
on conflict (version) do nothing;

commit;
