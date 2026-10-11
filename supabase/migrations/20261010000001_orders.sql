-- MultiSims USA - Milestone 2: orders, fulfilment items, payments, tickets, replacements.
--
-- State changes (claim, fulfil, cancel, refund, replace) go through SECURITY DEFINER
-- functions that check the caller's role and the current state in one statement, so two
-- agents can never work the same order and no state can be skipped. Staff read through
-- RLS; customers never touch these tables directly (server code looks orders up by token).

create extension if not exists pgcrypto with schema extensions;

-- Enums ---------------------------------------------------------------------

create type public.order_channel as enum ('website', 'dealer');

-- Internal order status. Customers only ever see Processing, Delivered or Shipped.
create type public.order_status as enum (
  'awaiting_payment',   -- created, invoice open
  'awaiting_approval',  -- replacement waiting for the owner (when that setting is on)
  'queued',             -- paid, waiting for an agent
  'claimed',            -- an agent is working on it
  'needs_attention',    -- agent flagged it (e.g. area code unavailable); admin decides
  'fulfilled',          -- every item delivered or shipped
  'cancelled'
);

create type public.payment_status as enum (
  'awaiting',        -- invoice created, nothing received
  'confirming',      -- payment seen on chain, waiting for confirmations
  'paid',
  'partially_paid',  -- underpaid; never auto-delivered, admin decides
  'expired',
  'failed',
  'not_required'     -- replacements
);

create type public.item_status as enum ('pending', 'fulfilled', 'replaced', 'cancelled');
create type public.ticket_severity as enum ('low', 'medium', 'high', 'urgent');
create type public.ticket_status as enum ('open', 'in_progress', 'resolved');

-- Role helpers ----------------------------------------------------------------

create or replace function public.is_agent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_role_is('agent');
$$;

-- Admin or agent: the people who fill orders.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_role_is('admin') or public.current_role_is('agent');
$$;

-- Orders ----------------------------------------------------------------------

create sequence public.order_number_seq start with 10001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.order_number_seq'),
  -- Private link to the customer's order page. 192 bits, unguessable.
  public_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  channel public.order_channel not null default 'website',
  status public.order_status not null default 'awaiting_payment',
  payment_status public.payment_status not null default 'awaiting',

  -- Customer
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  customer_email citext not null check (length(customer_email) <= 200),
  customer_phone text not null check (length(customer_phone) <= 40),
  zip_code text check (zip_code is null or length(zip_code) <= 10),
  area_code text check (area_code is null or area_code ~ '^[0-9]{3}$'),
  -- Physical SIMs only: { line1, line2, city, state, zip }
  shipping_address jsonb,

  -- What was bought, copied at purchase so later catalogue edits never change history.
  carrier_id uuid references public.carriers (id) on delete set null,
  plan_id uuid references public.plans (id) on delete set null,
  day_package_id uuid references public.day_packages (id) on delete set null,
  addon_id uuid references public.addons (id) on delete set null,
  carrier_name text not null,
  plan_name text not null,
  product_type public.product_type not null,
  days integer not null check (days > 0),
  addon_name text,
  quantity integer not null check (quantity between 1 and 1000),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  addon_price_cents integer not null default 0 check (addon_price_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),

  -- Fulfilment
  claimed_by uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz,
  attention_reason text,
  staff_note text,       -- owner's instruction to the agent (e.g. deliver nearest area code)
  paid_at timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  refunded_at timestamptz,
  refund_note text,
  refunded_by uuid references public.profiles (id) on delete set null,

  -- Replacements: a free order linked to the original, for one item.
  replacement_of uuid references public.orders (id) on delete set null,
  replaces_item_id uuid,
  ticket_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (product_type <> 'physical' or shipping_address is not null or replacement_of is not null)
);

create index orders_status_idx on public.orders (status, paid_at);
create index orders_created_idx on public.orders (created_at desc);
create index orders_email_idx on public.orders (customer_email);
create index orders_claimed_by_idx on public.orders (claimed_by) where claimed_by is not null;
create index orders_replacement_of_idx on public.orders (replacement_of) where replacement_of is not null;

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- One row per SIM. Quantity 3 means three items, each with its own QR or number.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  seq integer not null check (seq >= 1),
  status public.item_status not null default 'pending',
  phone_number text check (phone_number is null or length(phone_number) <= 30),
  iccid text check (iccid is null or length(iccid) <= 30),
  qr_path text,
  tracking_number text check (tracking_number is null or length(tracking_number) <= 60),
  fulfilled_at timestamptz,
  fulfilled_by uuid references public.profiles (id) on delete set null,
  replaced_at timestamptz,
  replaced_by_item uuid references public.order_items (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, seq)
);

create index order_items_phone_idx on public.order_items (phone_number) where phone_number is not null;
create index order_items_iccid_idx on public.order_items (iccid) where iccid is not null;

create trigger order_items_updated_at before update on public.order_items
  for each row execute function public.set_updated_at();

alter table public.orders
  add constraint orders_replaces_item_fk foreign key (replaces_item_id)
  references public.order_items (id) on delete set null;

-- Payments --------------------------------------------------------------------
-- One row per invoice. A customer whose invoice expired can open a new one, so an
-- order may have several. order_id is nullable: dealer wallet top-ups arrive in M3.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id) on delete cascade,
  provider text not null,                 -- 'nowpayments', 'dev' (local testing only)
  provider_invoice_id text,
  provider_payment_id text,
  invoice_url text,
  status public.payment_status not null default 'awaiting',
  provider_status text,                   -- raw status string from the provider
  price_cents integer not null check (price_cents >= 0),
  pay_currency text,                      -- e.g. usdttrc20, btc
  pay_amount numeric(30, 12),
  actually_paid numeric(30, 12),
  overpaid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index payments_provider_invoice_idx on public.payments (provider, provider_invoice_id)
  where provider_invoice_id is not null;
create index payments_order_idx on public.payments (order_id);

create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Every verified webhook, kept as received (audit trail, debugging disputes).
create table public.payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid references public.payments (id) on delete cascade,
  provider text not null,
  provider_status text,
  body jsonb not null,
  received_at timestamptz not null default now()
);

create index payment_events_payment_idx on public.payment_events (payment_id, received_at);

-- Customer messages (the contact button on a slow order) -------------------------

create table public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  message text not null check (length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index order_messages_order_idx on public.order_messages (order_id, created_at);

-- Tickets -----------------------------------------------------------------------

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 80),
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.ticket_types (name, display_order) values
  ('eSIM not installing', 1),
  ('eSIM not activating', 2),
  ('No signal', 3),
  ('Wrong number or area code', 4),
  ('Replacement request', 5),
  ('Other', 6);

create sequence public.ticket_number_seq start with 501;

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.ticket_number_seq'),
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid references public.order_items (id) on delete set null,
  ticket_type_id uuid references public.ticket_types (id) on delete set null,
  type_name text not null,
  severity public.ticket_severity not null default 'medium',
  description text not null check (length(description) between 50 and 4000),
  screenshot_path text,
  status public.ticket_status not null default 'open',
  answer text check (answer is null or length(answer) <= 4000),
  answered_by uuid references public.profiles (id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tickets_status_idx on public.tickets (status, created_at);
create index tickets_order_idx on public.tickets (order_id);

create trigger tickets_updated_at before update on public.tickets
  for each row execute function public.set_updated_at();

alter table public.orders
  add constraint orders_ticket_fk foreign key (ticket_id) references public.tickets (id) on delete set null;

-- Alerts already sent, so the every-minute check emails once per order.
create table public.order_alerts (
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (order_id, kind)
);

-- State transitions ---------------------------------------------------------------
-- All SECURITY DEFINER with an explicit role check, called by the signed-in user's
-- session so auth.uid() is the actor. Each returns the updated row or raises.

-- Payment confirmed (webhook, or admin accepting an underpayment). Service role or admin.
create or replace function public.mark_order_paid(p_order_id uuid, p_payment_status public.payment_status default 'paid')
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_needs_approval boolean;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.orders
     set payment_status = p_payment_status,
         paid_at = coalesce(paid_at, now()),
         status = case when status = 'awaiting_payment' then 'queued'::public.order_status else status end
   where id = p_order_id
     and status in ('awaiting_payment', 'queued', 'claimed', 'needs_attention', 'fulfilled')
  returning * into v_order;

  if v_order.id is null then
    raise exception 'order not payable' using errcode = 'P0002';
  end if;
  return v_order;
end;
$$;

-- Atomic claim: only one agent wins; everyone else gets "already claimed".
create or replace function public.claim_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.orders
     set status = 'claimed', claimed_by = auth.uid(), claimed_at = now()
   where id = p_order_id and status = 'queued'
  returning * into v_order;

  if v_order.id is null then
    raise exception 'already claimed' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;

-- Put a claimed order back in the queue (the agent who holds it, or admin).
create or replace function public.release_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  update public.orders
     set status = 'queued', claimed_by = null, claimed_at = null
   where id = p_order_id
     and status in ('claimed', 'needs_attention')
     and (claimed_by = auth.uid() or public.is_admin())
     and public.is_staff()
  returning * into v_order;

  if v_order.id is null then
    raise exception 'cannot release this order' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;

-- Admin hands an open order to an agent (or to themself).
create or replace function public.reassign_order(p_order_id uuid, p_agent_id uuid, p_note text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
     where id = p_agent_id and active and role in ('agent', 'admin')
  ) then
    raise exception 'not an active agent' using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'claimed', claimed_by = p_agent_id, claimed_at = now(), attention_reason = null,
         staff_note = coalesce(nullif(trim(p_note), ''), staff_note)
   where id = p_order_id and status in ('queued', 'claimed', 'needs_attention')
  returning * into v_order;

  if v_order.id is null then
    raise exception 'order is not open' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;

-- Agent flags a problem (area code unavailable, carrier issue). Admin decides next.
create or replace function public.flag_order(p_order_id uuid, p_reason text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason required' using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'needs_attention', attention_reason = left(trim(p_reason), 500)
   where id = p_order_id
     and status = 'claimed'
     and (claimed_by = auth.uid() or public.is_admin())
     and public.is_staff()
  returning * into v_order;

  if v_order.id is null then
    raise exception 'claim the order first' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;

-- Save one item's details while working on it. Only the agent holding the order (or admin).
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
     and i.status = 'pending'
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

-- Mark complete: every pending item must carry its QR (eSIM) or tracking number
-- (physical). Delivers the whole order at once. When it is a replacement, the item it
-- replaces is marked replaced.
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
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null
     or v_order.status not in ('claimed', 'needs_attention')
     or not public.is_staff()
     or not (v_order.claimed_by = auth.uid() or public.is_admin()) then
    raise exception 'claim the order first' using errcode = 'P0001';
  end if;

  select count(*) into v_missing
    from public.order_items
   where order_id = p_order_id and status = 'pending'
     and case when v_order.product_type = 'esim' then qr_path is null else tracking_number is null end;
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

-- Admin cancels an order that has not been delivered. Refund is recorded separately.
create or replace function public.cancel_order(p_order_id uuid, p_reason text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.orders
     set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(trim(p_reason), '')
   where id = p_order_id and status <> 'cancelled' and status <> 'fulfilled'
  returning * into v_order;

  if v_order.id is null then
    raise exception 'order cannot be cancelled' using errcode = 'P0001';
  end if;

  update public.order_items set status = 'cancelled' where order_id = p_order_id and status = 'pending';
  return v_order;
end;
$$;

-- Admin records a refund the owner sent from his own wallet. No money moves here.
create or replace function public.record_refund(p_order_id uuid, p_note text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.orders
     set refunded_at = now(), refund_note = nullif(trim(p_note), ''), refunded_by = auth.uid()
   where id = p_order_id and refunded_at is null and paid_at is not null
  returning * into v_order;

  if v_order.id is null then
    raise exception 'order is unpaid or already refunded' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;

-- Staff answer a ticket. One answer, which the customer sees on their order page.
create or replace function public.answer_ticket(p_ticket_id uuid, p_status public.ticket_status, p_answer text)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.tickets
     set status = p_status,
         answer = nullif(trim(p_answer), ''),
         answered_by = case when nullif(trim(p_answer), '') is distinct from answer then auth.uid() else answered_by end,
         answered_at = case when nullif(trim(p_answer), '') is distinct from answer then now() else answered_at end
   where id = p_ticket_id
  returning * into v_ticket;

  if v_ticket.id is null then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;
  return v_ticket;
end;
$$;

-- Issue Replacement: a free order for one delivered item, straight into the queue, or
-- held for the owner when the approval setting is on (admins skip the hold).
create or replace function public.issue_replacement(p_item_id uuid, p_ticket_id uuid default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.order_items;
  v_src public.orders;
  v_new public.orders;
  v_hold boolean;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_item from public.order_items where id = p_item_id;
  if v_item.id is null or v_item.status <> 'fulfilled' then
    raise exception 'only a delivered SIM can be replaced' using errcode = 'P0001';
  end if;
  select * into v_src from public.orders where id = v_item.order_id;

  if exists (
    select 1 from public.orders
     where replaces_item_id = p_item_id and status not in ('fulfilled', 'cancelled')
  ) then
    raise exception 'a replacement for this SIM is already open' using errcode = 'P0001';
  end if;

  select replacement_needs_approval and not public.is_admin() into v_hold from public.settings where id;

  insert into public.orders (
    channel, status, payment_status, customer_name, customer_email, customer_phone, zip_code,
    area_code, shipping_address, carrier_id, plan_id, day_package_id, addon_id, carrier_name,
    plan_name, product_type, days, addon_name, quantity, unit_price_cents, addon_price_cents,
    shipping_cents, total_cents, paid_at, replacement_of, replaces_item_id, ticket_id
  ) values (
    v_src.channel,
    case when coalesce(v_hold, false) then 'awaiting_approval'::public.order_status else 'queued'::public.order_status end,
    'not_required', v_src.customer_name, v_src.customer_email, v_src.customer_phone, v_src.zip_code,
    v_src.area_code, v_src.shipping_address, v_src.carrier_id, v_src.plan_id, v_src.day_package_id,
    v_src.addon_id, v_src.carrier_name, v_src.plan_name, v_src.product_type, v_src.days, v_src.addon_name,
    1, 0, 0, 0, 0, now(), coalesce(v_src.replacement_of, v_src.id), p_item_id, p_ticket_id
  ) returning * into v_new;

  insert into public.order_items (order_id, seq) values (v_new.id, 1);

  if p_ticket_id is not null then
    update public.tickets set status = 'in_progress' where id = p_ticket_id and status = 'open';
  end if;
  return v_new;
end;
$$;

-- Owner approves a held replacement.
create or replace function public.approve_replacement(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.orders set status = 'queued', paid_at = now()
   where id = p_order_id and status = 'awaiting_approval'
  returning * into v_order;
  if v_order.id is null then
    raise exception 'nothing to approve' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;

-- Orders paid more than N minutes ago (N from settings) that nobody has claimed and
-- that have not been alerted yet. Records the alert in the same statement, so a
-- second run never emails twice. Service role only (called by the cron function).
create or replace function public.take_unclaimed_alerts()
returns table (order_id uuid, number bigint, paid_at timestamptz, plan text, quantity integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select o.id
      from public.orders o, public.settings s
     where s.id
       and o.status = 'queued'
       and o.paid_at < now() - make_interval(mins => s.unclaimed_alert_minutes)
       and not exists (select 1 from public.order_alerts a where a.order_id = o.id and a.kind = 'unclaimed')
  ), ins as (
    insert into public.order_alerts (order_id, kind)
    select id, 'unclaimed' from due
    on conflict do nothing
    returning order_alerts.order_id
  )
  select o.id, o.number, o.paid_at, o.carrier_name || ' ' || o.plan_name, o.quantity
    from public.orders o join ins on ins.order_id = o.id;
end;
$$;

revoke all on function public.mark_order_paid(uuid, public.payment_status) from public, anon;
revoke all on function public.claim_order(uuid) from public, anon;
revoke all on function public.release_order(uuid) from public, anon;
revoke all on function public.reassign_order(uuid, uuid, text) from public, anon;
revoke all on function public.flag_order(uuid, text) from public, anon;
revoke all on function public.save_order_item(uuid, text, text, text, text) from public, anon;
revoke all on function public.complete_order(uuid) from public, anon;
revoke all on function public.cancel_order(uuid, text) from public, anon;
revoke all on function public.record_refund(uuid, text) from public, anon;
revoke all on function public.answer_ticket(uuid, public.ticket_status, text) from public, anon;
revoke all on function public.issue_replacement(uuid, uuid) from public, anon;
revoke all on function public.approve_replacement(uuid) from public, anon;
revoke all on function public.take_unclaimed_alerts() from public, anon, authenticated;
grant execute on function public.take_unclaimed_alerts() to service_role;

-- Row level security ------------------------------------------------------------------

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.order_messages enable row level security;
alter table public.ticket_types enable row level security;
alter table public.tickets enable row level security;
alter table public.order_alerts enable row level security;

-- Staff read everything order-related; writes go through the functions above.
create policy "orders: staff read" on public.orders
  for select to authenticated using (public.is_staff());
create policy "order_items: staff read" on public.order_items
  for select to authenticated using (public.is_staff());
create policy "payments: staff read" on public.payments
  for select to authenticated using (public.is_staff());
create policy "payment_events: admin read" on public.payment_events
  for select to authenticated using (public.is_admin());
create policy "order_messages: staff read" on public.order_messages
  for select to authenticated using (public.is_staff());
create policy "tickets: staff read" on public.tickets
  for select to authenticated using (public.is_staff());
create policy "ticket_types: staff read" on public.ticket_types
  for select to authenticated using (public.is_staff());
create policy "ticket_types: admin write" on public.ticket_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "order_alerts: admin read" on public.order_alerts
  for select to authenticated using (public.is_admin());

-- Agents need to see who holds an order and read the catalogue settings they work with.
create policy "profiles: staff read staff" on public.profiles
  for select to authenticated using (public.is_staff() and role in ('admin', 'agent'));
create policy "settings: staff read" on public.settings
  for select to authenticated using (public.is_staff());

-- Storage: QR codes and ticket screenshots are private. Signed URLs only. ---------------
-- Anyone holding a QR can install that eSIM, so these buckets are never public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('esim-qr', 'esim-qr', false, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('ticket-screenshots', 'ticket-screenshots', false, 5242880,
   array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

create policy "esim-qr: staff read" on storage.objects
  for select to authenticated using (bucket_id = 'esim-qr' and public.is_staff());
create policy "esim-qr: staff insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'esim-qr' and public.is_staff());
create policy "esim-qr: staff update" on storage.objects
  for update to authenticated using (bucket_id = 'esim-qr' and public.is_staff());
create policy "ticket-screenshots: staff read" on storage.objects
  for select to authenticated using (bucket_id = 'ticket-screenshots' and public.is_staff());

-- Realtime: the agent queue listens to order changes (RLS applies to what it receives).
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.tickets;

-- Customer contact list (admin, CSV export for the owner's own marketing later; we
-- never send marketing email). security_invoker, so the orders RLS still applies.
create view public.customer_contacts with (security_invoker = true) as
select
  customer_email as email,
  (array_agg(customer_name order by created_at desc))[1] as name,
  (array_agg(customer_phone order by created_at desc))[1] as phone,
  count(*) filter (where replacement_of is null) as orders,
  coalesce(sum(total_cents) filter (where status <> 'cancelled'), 0) as spent_cents,
  min(created_at) as first_order_at,
  max(created_at) as last_order_at
from public.orders
where channel = 'website'
group by customer_email;
