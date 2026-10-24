-- In-app notifications for the owner, agents and dealers: the bell in each portal.
--
-- One row per recipient. Rows are written only by the triggers below (SECURITY DEFINER),
-- so every path that changes an order, ticket or wallet notifies the same way, whichever
-- screen or webhook caused it. People read and mark their own rows; nobody writes them.

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (length(kind) <= 40),
  title text not null check (length(title) between 1 and 160),
  body text not null default '' check (length(body) <= 400),
  href text check (href is null or href ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

alter table public.notifications enable row level security;
create policy "notifications: read own" on public.notifications
  for select to authenticated using (recipient_id = auth.uid());
-- Marking as read: only read_at may change (enforced by the column grant below).
create policy "notifications: mark own read" on public.notifications
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

alter publication supabase_realtime add table public.notifications;

-- Helpers ------------------------------------------------------------------------------------

create or replace function public.notify_staff(p_kind text, p_title text, p_body text, p_href text, p_owner_only boolean default false)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, kind, title, body, href)
  select p.id, p_kind, left(p_title, 160), left(coalesce(p_body, ''), 400), p_href
    from public.profiles p
   where p.active and (p.role = 'admin' or (p.role = 'agent' and not p_owner_only));
$$;

create or replace function public.notify_user(p_recipient uuid, p_kind text, p_title text, p_body text, p_href text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, kind, title, body, href)
  select p.id, p_kind, left(p_title, 160), left(coalesce(p_body, ''), 400), p_href
    from public.profiles p
   where p.id = p_recipient and p.active;
$$;

create or replace function public.order_line_text(o public.orders)
returns text
language sql
immutable
set search_path = ''
as $$
  select o.quantity || ' x ' || o.carrier_name || ' ' || o.plan_name || ', ' || o.days || (case when o.days = 1 then ' day' else ' days' end);
$$;

-- Orders ---------------------------------------------------------------------------------------

create or replace function public.notifications_on_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := 'MS-' || new.number;
begin
  -- Into the queue (paid, approved replacement, or a SIM card ready to start). Dealer lines
  -- are announced once per bulk order by the batch trigger instead.
  if new.status = 'queued' and (tg_op = 'INSERT' or old.status is distinct from 'queued') and new.batch_id is null then
    perform public.notify_staff(
      case when new.phase = 'activate' then 'order_activate' when new.replacement_of is not null then 'order_replacement' else 'order_new' end,
      case when new.phase = 'activate' then 'Ready to activate ' || v_label
           when new.replacement_of is not null then 'Replacement ' || v_label
           else 'New order ' || v_label end,
      public.order_line_text(new),
      '/agent/orders/' || new.id);
  elsif new.status = 'queued' and tg_op = 'UPDATE' and old.status is distinct from 'queued' and new.batch_id is not null and new.phase = 'activate' then
    perform public.notify_staff('order_activate', 'Ready to activate ' || v_label, public.order_line_text(new), '/agent/orders/' || new.id);
  end if;

  if tg_op = 'UPDATE' and new.status = 'needs_attention' and old.status is distinct from 'needs_attention' then
    perform public.notify_staff('order_flagged', v_label || ' needs you', coalesce(new.attention_reason, 'Flagged by an agent'), '/admin/orders/' || new.id, true);
  end if;

  -- Dealer lines: tell the dealer as they are posted and as they go live.
  if tg_op = 'UPDATE' and new.dealer_id is not null and new.replacement_of is null and old.status is distinct from new.status then
    if new.status = 'shipped' then
      perform public.notify_user(new.dealer_id, 'line_shipped', 'SIM cards posted: ' || v_label, public.order_line_text(new), '/dealer/orders/' || new.batch_id);
    elsif new.status = 'fulfilled' then
      perform public.notify_user(new.dealer_id, 'line_delivered', 'Delivered: ' || v_label, public.order_line_text(new), '/dealer/orders/' || new.batch_id);
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_notifications
  after insert or update of status on public.orders
  for each row execute function public.notifications_on_order();

-- One notice per dealer bulk order, once its lines exist (checked at commit).
create or replace function public.notifications_on_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sims integer;
  v_lines integer;
  v_company text;
begin
  select coalesce(sum(quantity), 0), count(*) into v_sims, v_lines from public.orders where batch_id = new.id;
  select company into v_company from public.dealers where profile_id = new.dealer_id;
  perform public.notify_staff(
    'batch_new',
    'Dealer order B-' || new.number || ': ' || v_sims || (case when v_sims = 1 then ' SIM' else ' SIMs' end),
    coalesce(v_company, 'A dealer') || ', ' || v_lines || (case when v_lines = 1 then ' line' else ' lines' end),
    '/agent');
  return new;
end;
$$;

create constraint trigger order_batches_notifications
  after insert on public.order_batches
  deferrable initially deferred
  for each row execute function public.notifications_on_batch();

-- Tickets and messages --------------------------------------------------------------------------

create or replace function public.notifications_on_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = new.order_id;
  if tg_op = 'INSERT' then
    perform public.notify_staff('ticket_new', 'Ticket #' || new.number || ': ' || new.type_name,
      'MS-' || v_order.number || ', ' || new.severity || ' priority', '/agent/tickets/' || new.id);
  elsif new.answer is distinct from old.answer and new.answer is not null and v_order.dealer_id is not null then
    perform public.notify_user(v_order.dealer_id, 'ticket_answered', 'Ticket #' || new.number || ' answered',
      left(new.answer, 140), '/dealer/tickets#t-' || new.number);
  end if;
  return new;
end;
$$;

create trigger tickets_notifications
  after insert or update of answer on public.tickets
  for each row execute function public.notifications_on_ticket();

create or replace function public.notifications_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number bigint;
begin
  select number into v_number from public.orders where id = new.order_id;
  perform public.notify_staff('order_message', 'Message on MS-' || v_number, left(new.message, 140), '/admin/orders/' || new.order_id);
  return new;
end;
$$;

create trigger order_messages_notifications
  after insert on public.order_messages
  for each row execute function public.notifications_on_message();

-- Wallet ------------------------------------------------------------------------------------------

create or replace function public.notifications_on_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount text := '$' || to_char(new.amount_cents / 100.0, 'FM999,999,990.00');
  v_company text;
begin
  if new.kind in ('topup', 'manual_add', 'adjustment_credit') then
    perform public.notify_user(new.dealer_id, 'funds_added',
      case when new.kind = 'topup' then 'Top-up received: ' || v_amount else 'Funds added: ' || v_amount end,
      coalesce(new.note, ''), '/dealer/wallet');
  end if;
  if new.kind = 'topup' then
    select company into v_company from public.dealers where profile_id = new.dealer_id;
    perform public.notify_staff('topup', 'Top-up from ' || coalesce(v_company, 'a dealer') || ': ' || v_amount, '',
      '/admin/dealers/' || new.dealer_id, true);
  end if;
  return new;
end;
$$;

create trigger wallet_ledger_notifications
  after insert on public.wallet_ledger
  for each row execute function public.notifications_on_ledger();

revoke all on function public.notify_staff(text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.notify_user(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notifications_on_order() from public, anon, authenticated;
revoke all on function public.notifications_on_batch() from public, anon, authenticated;
revoke all on function public.notifications_on_ticket() from public, anon, authenticated;
revoke all on function public.notifications_on_message() from public, anon, authenticated;
revoke all on function public.notifications_on_ledger() from public, anon, authenticated;
