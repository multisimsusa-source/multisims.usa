-- Milestone 2 changes agreed with the client on 14 Oct 2026.
--
-- 1. Pricing: a SIM card price per physical SIM, a flat network fee on every order and a
--    minimum order total, all in Settings. Every line is stored on the order.
-- 2. Physical SIMs ship first and are activated later: when the customer says the SIM
--    arrived, or on the date they chose at checkout. An order runs through two phases,
--    'fulfil' (post the cards) and 'activate' (start the lines); each phase goes through
--    the queue the same way (queued, claimed, done).
-- 3. Unpaid invoices are marked expired by a scheduled job: NOWPayments sends no webhook
--    when an invoice expires unpaid.

-- Settings ------------------------------------------------------------------------------

alter table public.settings
  add column sim_card_price_cents integer not null default 500 check (sim_card_price_cents >= 0),
  add column network_fee_cents integer not null default 300 check (network_fee_cents >= 0),
  add column min_order_cents integer not null default 1500 check (min_order_cents >= 0);

-- Test placeholder until the client sets the real shipping fee.
update public.settings set shipping_fee_cents = 100 where id and shipping_fee_cents = 0;

-- Orders ---------------------------------------------------------------------------------

alter table public.orders
  add column sim_card_price_cents integer not null default 0 check (sim_card_price_cents >= 0),
  add column network_fee_cents integer not null default 0 check (network_fee_cents >= 0),
  add column plan_start text check (plan_start in ('on_receipt', 'on_date')),
  add column activate_on date,
  add column phase text not null default 'fulfil' check (phase in ('fulfil', 'activate')),
  add column shipped_at timestamptz,
  add column activation_requested_at timestamptz,
  add constraint orders_activate_on_check check (plan_start is distinct from 'on_date' or activate_on is not null);

-- Today in the US, where the lines are activated.
create or replace function public.us_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/New_York')::date;
$$;

-- Saving item details: as before while posting (pending items); in the activation phase
-- the agent adds the phone number to items that were already posted.
create or replace function public.save_order_item(
  p_item_id uuid,
  p_phone_number text,
  p_iccid text,
  p_qr_path text,
  p_tracking_number text
)
returns public.order_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.order_items;
begin
  update public.order_items i
     set phone_number = nullif(trim(p_phone_number), ''),
         iccid = nullif(trim(p_iccid), ''),
         qr_path = coalesce(nullif(p_qr_path, ''), i.qr_path),
         tracking_number = nullif(trim(p_tracking_number), '')
    from public.orders o
   where i.id = p_item_id
     and o.id = i.order_id
     and (i.status = 'pending' or (o.phase = 'activate' and i.status = 'fulfilled'))
     and o.status in ('claimed', 'needs_attention')
     and public.is_staff()
     and (o.claimed_by = auth.uid() or public.is_admin())
  returning i.* into v_item;

  if v_item.id is null then
    raise exception 'claim the order first' using errcode = 'P0001';
  end if;
  return v_item;
end;
$$;

-- Mark complete.
-- eSIM: every SIM has its QR; the order is delivered.
-- Physical, posting phase: every SIM has its ICCID and tracking number; the order becomes
--   'shipped' and moves to the activation phase. A start date that is already due goes
--   straight back into the queue.
-- Physical, activation phase: every SIM has its phone number; the order is delivered.
-- A replacement marks the SIM it replaces as replaced once the new line is live.
create or replace function public.complete_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_missing integer;
  v_new_item uuid;
  v_due boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null
     or v_order.status not in ('claimed', 'needs_attention')
     or not public.is_staff()
     or not (v_order.claimed_by = auth.uid() or public.is_admin()) then
    raise exception 'claim the order first' using errcode = 'P0001';
  end if;

  if v_order.product_type = 'physical' and v_order.phase = 'fulfil' then
    select count(*) into v_missing
      from public.order_items
     where order_id = p_order_id and status = 'pending' and (tracking_number is null or iccid is null);
    if v_missing > 0 then
      raise exception 'missing details on % item(s)', v_missing using errcode = 'P0001';
    end if;

    update public.order_items
       set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid()
     where order_id = p_order_id and status = 'pending';

    v_due := v_order.plan_start = 'on_date' and v_order.activate_on <= public.us_today();
    update public.orders
       set phase = 'activate',
           shipped_at = now(),
           status = case when v_due then 'queued'::public.order_status else 'shipped'::public.order_status end,
           activation_requested_at = case when v_due then now() else null end,
           claimed_by = null, claimed_at = null, attention_reason = null, staff_note = null
     where id = p_order_id
    returning * into v_order;
    return v_order;
  end if;

  if v_order.product_type = 'physical' then
    select count(*) into v_missing
      from public.order_items
     where order_id = p_order_id and status = 'fulfilled' and phone_number is null;
  else
    select count(*) into v_missing
      from public.order_items
     where order_id = p_order_id and status = 'pending' and qr_path is null;
  end if;
  if v_missing > 0 then
    raise exception 'missing details on % item(s)', v_missing using errcode = 'P0001';
  end if;

  update public.order_items
     set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid()
   where order_id = p_order_id and status = 'pending';

  update public.orders
     set status = 'fulfilled', fulfilled_at = now(), attention_reason = null
   where id = p_order_id
  returning * into v_order;

  if v_order.replaces_item_id is not null then
    select id into v_new_item from public.order_items where order_id = p_order_id order by seq limit 1;
    update public.order_items
       set status = 'replaced', replaced_at = now(), replaced_by_item = v_new_item
     where id = v_order.replaces_item_id and status = 'fulfilled';
  end if;

  return v_order;
end;
$$;

-- The customer's "My SIM has arrived" button. Works once: the order must still be waiting
-- for it. Service role only (the order page runs server-side, keyed by the private token).
create or replace function public.request_activation(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.orders
     set status = 'queued', activation_requested_at = now()
   where id = p_order_id
     and status = 'shipped'
     and phase = 'activate'
     and coalesce(plan_start, 'on_receipt') = 'on_receipt'
     and activation_requested_at is null
  returning * into v_order;

  if v_order.id is null then
    raise exception 'activation already requested' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;

-- Shipped orders whose chosen start date has come go into the queue. Run by pg_cron.
create or replace function public.queue_due_activations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.orders
     set status = 'queued', activation_requested_at = now()
   where status = 'shipped'
     and phase = 'activate'
     and plan_start = 'on_date'
     and activate_on <= public.us_today();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Invoices nobody paid. A fixed-rate NOWPayments invoice holds its price for about 20
-- minutes and is reused for 15, so after an hour with nothing received it is dead.
-- A late webhook can still move it on: expired ranks below confirming and paid.
create or replace function public.expire_stale_payments()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.payments
     set status = 'expired', provider_status = coalesce(provider_status, 'expired_unpaid')
   where status = 'awaiting' and created_at < now() - interval '1 hour';
  get diagnostics v_count = row_count;

  update public.orders o
     set payment_status = 'expired'
   where o.status = 'awaiting_payment'
     and o.payment_status = 'awaiting'
     and exists (select 1 from public.payments p where p.order_id = o.id)
     and not exists (
       select 1 from public.payments p
        where p.order_id = o.id and p.status not in ('expired', 'failed')
     );
  return v_count;
end;
$$;

-- Unclaimed alerts cover both phases. The clock starts when the job entered the queue:
-- payment for posting, the activation request for activation.
create or replace function public.take_unclaimed_alerts()
returns table (order_id uuid, number bigint, paid_at timestamptz, plan text, quantity integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select o.id, case when o.phase = 'activate' then 'unclaimed-activation' else 'unclaimed' end as kind
      from public.orders o, public.settings s
     where s.id
       and o.status = 'queued'
       and coalesce(o.activation_requested_at, o.paid_at) < now() - make_interval(mins => s.unclaimed_alert_minutes)
       and not exists (
         select 1 from public.order_alerts a
          where a.order_id = o.id
            and a.kind = case when o.phase = 'activate' then 'unclaimed-activation' else 'unclaimed' end
       )
  ), ins as (
    insert into public.order_alerts (order_id, kind)
    select id, kind from due
    on conflict do nothing
    returning order_alerts.order_id
  )
  select o.id, o.number, coalesce(o.activation_requested_at, o.paid_at), o.carrier_name || ' ' || o.plan_name, o.quantity
    from public.orders o join ins on ins.order_id = o.id;
end;
$$;

revoke all on function public.request_activation(uuid) from public, anon, authenticated;
revoke all on function public.queue_due_activations() from public, anon, authenticated;
revoke all on function public.expire_stale_payments() from public, anon, authenticated;
grant execute on function public.request_activation(uuid) to service_role;
grant execute on function public.queue_due_activations() to service_role;
grant execute on function public.expire_stale_payments() to service_role;

-- Scheduled jobs (pg_cron is enabled by the unclaimed-alert migration). ------------------

select cron.schedule('queue-due-activations', '*/10 * * * *', $$ select public.queue_due_activations(); $$);
select cron.schedule('expire-stale-payments', '*/10 * * * *', $$ select public.expire_stale_payments(); $$);

-- The unclaimed alert job wakes its Edge Function for either phase.
select cron.schedule(
  'unclaimed-order-alert',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/unclaimed-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'cron_secret')
    and exists (
      select 1
        from public.orders o, public.settings s
       where s.id
         and o.status = 'queued'
         and coalesce(o.activation_requested_at, o.paid_at) < now() - make_interval(mins => s.unclaimed_alert_minutes)
         and not exists (
           select 1 from public.order_alerts a
            where a.order_id = o.id
              and a.kind = case when o.phase = 'activate' then 'unclaimed-activation' else 'unclaimed' end
         )
    );
  $$
);
