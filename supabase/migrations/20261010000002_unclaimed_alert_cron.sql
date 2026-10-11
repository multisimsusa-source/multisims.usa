-- Five-minute unclaimed alert, run from Supabase (Vercel Hobby crons only run daily).
-- Every minute pg_cron checks, in SQL, whether any paid order has waited longer than
-- settings.unclaimed_alert_minutes without a claim and has not been alerted yet. Only
-- then does it call the `unclaimed-alert` Edge Function, which emails the owner.
--
-- Needs two Vault secrets, created once per project (never committed):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<long random string>', 'cron_secret');
-- The same cron_secret value is set on the function: supabase secrets set CRON_SECRET=...
-- Until both exist the job does nothing.

create extension if not exists pg_cron;
create extension if not exists pg_net;

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
         and o.paid_at < now() - make_interval(mins => s.unclaimed_alert_minutes)
         and not exists (select 1 from public.order_alerts a where a.order_id = o.id and a.kind = 'unclaimed')
    );
  $$
);
