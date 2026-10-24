-- MultiSims USA - Milestone 3: dealers, wholesale prices, bulk orders and the wallet.
--
-- A dealer's bulk order is a batch of ordinary orders, one per line, so the agent queue,
-- fulfilment screen, replacements and tickets work on them unchanged.
--
-- The wallet is a ledger. Every movement is a row with who did it and a note; balances are
-- calculated, never stored. Placing a batch reserves its total; each SIM takes its share as
-- it is filled (capture); cancelling an order releases what it has not taken.

-- Dealers ---------------------------------------------------------------------------------

create or replace function public.is_dealer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_role_is('dealer');
$$;

create table public.dealers (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  company text not null check (length(trim(company)) between 1 and 120),
  phone text not null default '' check (length(phone) <= 40),
  -- How far below zero the dealer may go. 0 = pay first (the brief's default).
  credit_limit_cents integer not null default 0 check (credit_limit_cents >= 0),
  -- Per-dealer SIM card price; null = settings.dealer_sim_card_price_cents.
  sim_card_price_cents integer check (sim_card_price_cents is null or sim_card_price_cents >= 0),
  note text not null default '' check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger dealers_updated_at before update on public.dealers
  for each row execute function public.set_updated_at();

-- Optional per-dealer price for a day package; otherwise the package's wholesale price.
create table public.dealer_prices (
  dealer_id uuid not null references public.dealers (profile_id) on delete cascade,
  day_package_id uuid not null references public.day_packages (id) on delete cascade,
  price_cents integer not null check (price_cents >= 0),
  updated_at timestamptz not null default now(),
  primary key (dealer_id, day_package_id)
);

create trigger dealer_prices_updated_at before update on public.dealer_prices
  for each row execute function public.set_updated_at();

alter table public.settings
  add column dealer_sim_card_price_cents integer not null default 400 check (dealer_sim_card_price_cents >= 0);

-- Batches -----------------------------------------------------------------------------------

create sequence public.batch_number_seq start with 1001;

create table public.order_batches (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.batch_number_seq'),
  dealer_id uuid not null references public.dealers (profile_id) on delete restrict,
  reference text check (reference is null or length(reference) <= 80),  -- dealer's own note
  shipping_address jsonb,
  total_cents integer not null check (total_cents >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index order_batches_dealer_idx on public.order_batches (dealer_id, created_at desc);

alter table public.orders
  add column batch_id uuid references public.order_batches (id) on delete restrict,
  add column dealer_id uuid references public.dealers (profile_id) on delete restrict,
  add constraint orders_dealer_channel_check check ((channel = 'dealer') = (dealer_id is not null));

create index orders_batch_idx on public.orders (batch_id) where batch_id is not null;
create index orders_dealer_idx on public.orders (dealer_id, created_at desc) where dealer_id is not null;

-- Payments: an invoice is for an order or for a wallet top-up -----------------------------------

alter table public.payments
  add column kind text not null default 'order' check (kind in ('order', 'wallet_topup')),
  add column dealer_id uuid references public.dealers (profile_id) on delete restrict,
  add constraint payments_kind_dealer_check check (
    (kind = 'order' and dealer_id is null) or (kind = 'wallet_topup' and dealer_id is not null and order_id is null)
  );

create index payments_dealer_idx on public.payments (dealer_id) where dealer_id is not null;

-- Wallet ledger -------------------------------------------------------------------------------

create type public.ledger_kind as enum (
  'topup',              -- crypto top-up confirmed by webhook
  'manual_add',         -- owner added funds (paid outside the platform)
  'adjustment_credit',  -- owner correction up
  'adjustment_debit',   -- owner correction down
  'reserve',            -- held when an order is placed
  'capture',            -- taken as a SIM is filled
  'release',            -- hold returned when an order is cancelled
  'refund'              -- owner refunded a filled order to the wallet
);

create table public.wallet_ledger (
  id bigint generated always as identity primary key,
  dealer_id uuid not null references public.dealers (profile_id) on delete restrict,
  kind public.ledger_kind not null,
  amount_cents integer not null check (amount_cents > 0),
  order_id uuid references public.orders (id) on delete restrict,
  order_item_id uuid references public.order_items (id) on delete restrict,
  batch_id uuid references public.order_batches (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete restrict,
  created_by uuid references public.profiles (id) on delete set null,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  check (kind not in ('manual_add', 'adjustment_credit', 'adjustment_debit') or length(trim(coalesce(note, ''))) > 0),
  check (kind <> 'topup' or payment_id is not null),
  check (kind not in ('reserve', 'release', 'refund') or order_id is not null),
  check (kind <> 'capture' or order_item_id is not null)
);

create index wallet_ledger_dealer_idx on public.wallet_ledger (dealer_id, created_at desc);
create index wallet_ledger_order_idx on public.wallet_ledger (order_id) where order_id is not null;

-- Each of these happens at most once, so retries and double clicks never move money twice.
create unique index wallet_ledger_topup_once on public.wallet_ledger (payment_id) where kind = 'topup';
create unique index wallet_ledger_capture_once on public.wallet_ledger (order_item_id) where kind = 'capture';
create unique index wallet_ledger_reserve_once on public.wallet_ledger (order_id) where kind = 'reserve';
create unique index wallet_ledger_release_once on public.wallet_ledger (order_id) where kind = 'release';
create unique index wallet_ledger_refund_once on public.wallet_ledger (order_id) where kind = 'refund';

-- Balance: money in minus money taken. Reserved: held for orders not yet filled.
-- Available: what the dealer can spend now, including their credit limit.
create or replace function public.dealer_wallet(p_dealer_id uuid)
returns table (balance_cents bigint, reserved_cents bigint, credit_limit_cents integer, available_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with sums as (
    select
      coalesce(sum(amount_cents) filter (where kind in ('topup', 'manual_add', 'adjustment_credit', 'refund')), 0)
        - coalesce(sum(amount_cents) filter (where kind in ('capture', 'adjustment_debit')), 0) as balance,
      coalesce(sum(amount_cents) filter (where kind = 'reserve'), 0)
        - coalesce(sum(amount_cents) filter (where kind in ('capture', 'release') and order_id is not null), 0) as reserved
    from public.wallet_ledger
    where dealer_id = p_dealer_id
  )
  select s.balance, s.reserved, d.credit_limit_cents, s.balance - s.reserved + d.credit_limit_cents
    from sums s, public.dealers d
   where d.profile_id = p_dealer_id
     and (p_dealer_id = auth.uid() or public.is_admin() or auth.role() = 'service_role');
$$;

-- Prices --------------------------------------------------------------------------------------

-- The price a dealer pays for one SIM of a day package (before calling and SIM card), or null
-- when the package is not offered to dealers.
create or replace function public.dealer_package_price(p_dealer_id uuid, p_day_package_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select price_cents from public.dealer_prices where dealer_id = p_dealer_id and day_package_id = p_day_package_id),
    (select wholesale_price_cents from public.day_packages where id = p_day_package_id)
  );
$$;

-- Everything a dealer can order, at their prices. The caller's own catalogue, or any dealer's
-- for an admin.
create or replace function public.dealer_catalog(p_dealer_id uuid default null)
returns table (
  day_package_id uuid,
  plan_id uuid,
  carrier_id uuid,
  carrier_name text,
  carrier_order integer,
  plan_name text,
  plan_slug text,
  product_type public.product_type,
  plan_order integer,
  days integer,
  price_cents integer,
  retail_price_cents integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dealer uuid := coalesce(p_dealer_id, auth.uid());
begin
  if not (
    (v_dealer = auth.uid() and public.is_dealer())
    or public.is_admin()
    or auth.role() = 'service_role'
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  select dp.id, p.id, c.id, c.name, c.display_order, p.name, p.slug, p.product_type, p.display_order,
         dp.days, public.dealer_package_price(v_dealer, dp.id), dp.price_cents
    from public.day_packages dp
    join public.plans p on p.id = dp.plan_id
    join public.carriers c on c.id = p.carrier_id
   where dp.active and p.published and c.active
     and public.dealer_package_price(v_dealer, dp.id) is not null
   order by c.display_order, c.name, p.display_order, p.name, dp.days;
end;
$$;

-- Placing a batch ------------------------------------------------------------------------------
-- p_lines: [{ "day_package_id": uuid, "quantity": int, "intl_calling": bool }, ...]
-- p_address: { line1, line2, city, state, zip } (required when any line is a SIM card)
-- Prices are read here, never trusted from the browser. The dealer row is locked, so two
-- batches placed at once cannot both spend the same funds.

create or replace function public.place_dealer_batch(p_lines jsonb, p_address jsonb default null, p_reference text default null)
returns public.order_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dealer public.dealers;
  v_profile public.profiles;
  v_settings public.settings;
  v_addon public.addons;
  v_batch public.order_batches;
  v_order public.orders;
  v_line jsonb;
  v_pkg record;
  v_qty integer;
  v_unit integer;
  v_addon_price integer;
  v_sim integer;
  v_shipping integer;
  v_line_total integer;
  v_total bigint := 0;
  v_count integer := 0;
  v_sims integer := 0;
  v_has_physical boolean := false;
  v_shipping_taken boolean := false;
  v_available bigint;
begin
  if not public.is_dealer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_dealer from public.dealers where profile_id = auth.uid() for update;
  select * into v_profile from public.profiles where id = auth.uid();
  if v_dealer.profile_id is null then
    raise exception 'dealer account not set up' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'add at least one line' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_lines) > 30 then
    raise exception 'at most 30 lines per order' using errcode = 'P0001';
  end if;

  select * into v_settings from public.settings where id;
  select * into v_addon from public.addons where code = 'intl_calling' and active;

  -- First pass: validate every line and work out the total.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 500 then
      raise exception 'each line takes 1 to 500 SIMs' using errcode = 'P0001';
    end if;

    select dp.id, dp.days, p.product_type into v_pkg
      from public.day_packages dp
      join public.plans p on p.id = dp.plan_id
      join public.carriers c on c.id = p.carrier_id
     where dp.id = (v_line ->> 'day_package_id')::uuid and dp.active and p.published and c.active;
    if v_pkg.id is null then
      raise exception 'a plan in this order is no longer available' using errcode = 'P0001';
    end if;

    v_unit := public.dealer_package_price(v_dealer.profile_id, v_pkg.id);
    if v_unit is null then
      raise exception 'a plan in this order has no dealer price' using errcode = 'P0001';
    end if;
    if coalesce((v_line ->> 'intl_calling')::boolean, false) then
      if v_addon.id is null or v_addon.wholesale_price_cents is null then
        raise exception 'international calling is not available to dealers' using errcode = 'P0001';
      end if;
      v_addon_price := v_addon.wholesale_price_cents;
    else
      v_addon_price := 0;
    end if;

    if v_pkg.product_type = 'physical' then
      v_has_physical := true;
      v_sim := coalesce(v_dealer.sim_card_price_cents, v_settings.dealer_sim_card_price_cents);
    else
      v_sim := 0;
    end if;

    v_total := v_total + (v_unit + v_addon_price + v_sim)::bigint * v_qty;
    v_sims := v_sims + v_qty;
  end loop;

  if v_sims > 1000 then
    raise exception 'at most 1000 SIMs per order' using errcode = 'P0001';
  end if;

  if v_has_physical then
    if p_address is null
       or length(trim(coalesce(p_address ->> 'line1', ''))) = 0
       or length(trim(coalesce(p_address ->> 'city', ''))) = 0
       or length(trim(coalesce(p_address ->> 'state', ''))) = 0
       or coalesce(p_address ->> 'zip', '') !~ '^[0-9]{5}(-[0-9]{4})?$' then
      raise exception 'a US delivery address is needed for SIM cards' using errcode = 'P0001';
    end if;
    v_total := v_total + v_settings.shipping_fee_cents;
  end if;

  select available_cents into v_available from public.dealer_wallet(v_dealer.profile_id);
  if v_total > v_available then
    raise exception 'not enough funds: this order is % and % is available', v_total, v_available
      using errcode = 'P0001';
  end if;

  insert into public.order_batches (dealer_id, reference, shipping_address, total_cents, created_by)
  values (
    v_dealer.profile_id,
    nullif(left(trim(coalesce(p_reference, '')), 80), ''),
    case when v_has_physical then p_address else null end,
    v_total,
    auth.uid()
  )
  returning * into v_batch;

  -- Second pass: one order per line, its items, and its hold on the wallet.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_count := v_count + 1;
    v_qty := (v_line ->> 'quantity')::integer;

    select dp.id, dp.days, p.id as plan_id, p.name as plan_name, p.product_type, c.id as carrier_id, c.name as carrier_name
      into v_pkg
      from public.day_packages dp
      join public.plans p on p.id = dp.plan_id
      join public.carriers c on c.id = p.carrier_id
     where dp.id = (v_line ->> 'day_package_id')::uuid;

    v_unit := public.dealer_package_price(v_dealer.profile_id, v_pkg.id);
    v_addon_price := case when coalesce((v_line ->> 'intl_calling')::boolean, false) then v_addon.wholesale_price_cents else 0 end;
    v_sim := case when v_pkg.product_type = 'physical' then coalesce(v_dealer.sim_card_price_cents, v_settings.dealer_sim_card_price_cents) else 0 end;
    -- Shipping is charged once per batch, on its first SIM card line.
    v_shipping := case when v_pkg.product_type = 'physical' and not v_shipping_taken then v_settings.shipping_fee_cents else 0 end;
    if v_pkg.product_type = 'physical' then
      v_shipping_taken := true;
    end if;
    v_line_total := (v_unit + v_addon_price + v_sim) * v_qty + v_shipping;

    insert into public.orders (
      channel, status, payment_status, customer_name, customer_email, customer_phone,
      shipping_address, carrier_id, plan_id, day_package_id, addon_id, carrier_name, plan_name,
      product_type, days, addon_name, quantity, unit_price_cents, addon_price_cents, shipping_cents,
      sim_card_price_cents, network_fee_cents, total_cents, paid_at, plan_start, batch_id, dealer_id
    ) values (
      'dealer', 'queued', 'paid', v_dealer.company, v_profile.email, coalesce(nullif(v_dealer.phone, ''), '-'),
      case when v_pkg.product_type = 'physical' then p_address else null end,
      v_pkg.carrier_id, v_pkg.plan_id, v_pkg.id,
      case when v_addon_price > 0 then v_addon.id else null end,
      v_pkg.carrier_name, v_pkg.plan_name, v_pkg.product_type, v_pkg.days,
      case when v_addon_price > 0 then v_addon.name else null end,
      v_qty, v_unit, v_addon_price, v_shipping, v_sim, 0, v_line_total, now(),
      case when v_pkg.product_type = 'physical' then 'on_receipt' else null end,
      v_batch.id, v_dealer.profile_id
    ) returning * into v_order;

    insert into public.order_items (order_id, seq)
    select v_order.id, g from generate_series(1, v_qty) g;

    if v_line_total > 0 then
      insert into public.wallet_ledger (dealer_id, kind, amount_cents, order_id, batch_id, created_by, note)
      values (v_dealer.profile_id, 'reserve', v_line_total, v_order.id, v_batch.id, auth.uid(),
              'Order B-' || v_batch.number || ', line ' || v_count);
    end if;
  end loop;

  return v_batch;
end;
$$;

-- Capture and release -------------------------------------------------------------------------
-- Triggers, so every path that fills or cancels an order (agent, owner, future carrier API)
-- moves the wallet the same way.

-- A SIM's share of its order: the total split evenly, the last SIM taking the remainder.
-- Shares always add up to the order total exactly.
create or replace function public.item_share_cents(p_total integer, p_quantity integer, p_seq integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (p_total / p_quantity) + case when p_seq = p_quantity then p_total % p_quantity else 0 end;
$$;

create or replace function public.wallet_capture_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_amount integer;
begin
  select * into v_order from public.orders where id = new.order_id;
  if v_order.dealer_id is null or v_order.replacement_of is not null or v_order.total_cents = 0 then
    return new;
  end if;

  v_amount := public.item_share_cents(v_order.total_cents, v_order.quantity, new.seq);
  if v_amount > 0 then
    insert into public.wallet_ledger (dealer_id, kind, amount_cents, order_id, order_item_id, batch_id, created_by, note)
    values (v_order.dealer_id, 'capture', v_amount, v_order.id, new.id, v_order.batch_id, auth.uid(),
            'MS-' || v_order.number || ', SIM ' || new.seq)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger order_items_wallet_capture
  after update of status on public.order_items
  for each row
  when (old.status = 'pending' and new.status = 'fulfilled')
  execute function public.wallet_capture_item();

create or replace function public.wallet_release_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left bigint;
begin
  if new.dealer_id is null then
    return new;
  end if;

  select coalesce(sum(amount_cents) filter (where kind = 'reserve'), 0)
       - coalesce(sum(amount_cents) filter (where kind in ('capture', 'release')), 0)
    into v_left
    from public.wallet_ledger
   where order_id = new.id;

  if v_left > 0 then
    insert into public.wallet_ledger (dealer_id, kind, amount_cents, order_id, batch_id, created_by, note)
    values (new.dealer_id, 'release', v_left, new.id, new.batch_id, auth.uid(),
            'MS-' || new.number || ' cancelled' || coalesce(': ' || new.cancel_reason, ''))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger orders_wallet_release
  after update of status on public.orders
  for each row
  when (old.status <> 'cancelled' and new.status = 'cancelled')
  execute function public.wallet_release_order();

-- A refund on a dealer order goes back to the wallet: everything the order took.
create or replace function public.wallet_refund_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_taken bigint;
begin
  if new.dealer_id is null then
    return new;
  end if;

  select coalesce(sum(amount_cents), 0) into v_taken
    from public.wallet_ledger
   where order_id = new.id and kind = 'capture';

  if v_taken > 0 then
    insert into public.wallet_ledger (dealer_id, kind, amount_cents, order_id, batch_id, created_by, note)
    values (new.dealer_id, 'refund', v_taken, new.id, new.batch_id, auth.uid(),
            coalesce(nullif(new.refund_note, ''), 'Refund for MS-' || new.number))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger orders_wallet_refund
  after update of refunded_at on public.orders
  for each row
  when (old.refunded_at is null and new.refunded_at is not null)
  execute function public.wallet_refund_order();

-- Owner's wallet entries ------------------------------------------------------------------------

create or replace function public.wallet_owner_entry(
  p_dealer_id uuid,
  p_kind public.ledger_kind,
  p_amount_cents integer,
  p_note text
)
returns public.wallet_ledger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.wallet_ledger;
  v_available bigint;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('manual_add', 'adjustment_credit', 'adjustment_debit') then
    raise exception 'not an owner entry' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 10000000 then
    raise exception 'enter an amount above zero' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'a note is required' using errcode = 'P0001';
  end if;

  perform 1 from public.dealers where profile_id = p_dealer_id for update;
  if not found then
    raise exception 'dealer not found' using errcode = 'P0002';
  end if;

  if p_kind = 'adjustment_debit' then
    select available_cents into v_available from public.dealer_wallet(p_dealer_id);
    if p_amount_cents > v_available then
      raise exception 'only % is available to take', v_available using errcode = 'P0001';
    end if;
  end if;

  insert into public.wallet_ledger (dealer_id, kind, amount_cents, created_by, note)
  values (p_dealer_id, p_kind, p_amount_cents, auth.uid(), left(trim(p_note), 500))
  returning * into v_row;
  return v_row;
end;
$$;

-- Top-up confirmed by the provider's webhook. Credits once per payment. Service role only.
create or replace function public.credit_wallet_topup(p_payment_id uuid)
returns public.wallet_ledger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_row public.wallet_ledger;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null or v_payment.kind <> 'wallet_topup' then
    raise exception 'not a top-up' using errcode = 'P0002';
  end if;

  insert into public.wallet_ledger (dealer_id, kind, amount_cents, payment_id, created_by, note)
  values (v_payment.dealer_id, 'topup', v_payment.price_cents, v_payment.id, auth.uid(),
          'Crypto top-up' || coalesce(' (' || upper(v_payment.pay_currency) || ')', ''))
  on conflict do nothing
  returning * into v_row;
  return v_row;
end;
$$;

-- Physical SIM cards a dealer has received: start every line in the batch still waiting.
create or replace function public.request_batch_activation(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not exists (
    select 1 from public.order_batches b
     where b.id = p_batch_id and (b.dealer_id = auth.uid() and public.is_dealer() or public.is_admin())
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.orders
     set status = 'queued', activation_requested_at = now()
   where batch_id = p_batch_id
     and status = 'shipped'
     and phase = 'activate'
     and activation_requested_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.dealer_wallet(uuid) from public, anon;
revoke all on function public.dealer_package_price(uuid, uuid) from public, anon, authenticated;
revoke all on function public.dealer_catalog(uuid) from public, anon;
revoke all on function public.place_dealer_batch(jsonb, jsonb, text) from public, anon;
revoke all on function public.wallet_owner_entry(uuid, public.ledger_kind, integer, text) from public, anon;
revoke all on function public.credit_wallet_topup(uuid) from public, anon;
revoke all on function public.request_batch_activation(uuid) from public, anon;
revoke all on function public.wallet_capture_item() from public, anon, authenticated;
revoke all on function public.wallet_release_order() from public, anon, authenticated;
revoke all on function public.wallet_refund_order() from public, anon, authenticated;
grant execute on function public.dealer_package_price(uuid, uuid) to service_role;

-- Row level security ------------------------------------------------------------------------------
-- Dealers read only their own rows. Every write goes through the functions above or admin.

alter table public.dealers enable row level security;
alter table public.dealer_prices enable row level security;
alter table public.order_batches enable row level security;
alter table public.wallet_ledger enable row level security;

create policy "dealers: admin all" on public.dealers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "dealers: read own" on public.dealers
  for select to authenticated using (profile_id = auth.uid());

create policy "dealer_prices: admin all" on public.dealer_prices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "dealer_prices: read own" on public.dealer_prices
  for select to authenticated using (dealer_id = auth.uid());

create policy "order_batches: staff read" on public.order_batches
  for select to authenticated using (public.is_staff());
create policy "order_batches: read own" on public.order_batches
  for select to authenticated using (dealer_id = auth.uid() and public.is_dealer());

create policy "wallet_ledger: admin read" on public.wallet_ledger
  for select to authenticated using (public.is_admin());
create policy "wallet_ledger: read own" on public.wallet_ledger
  for select to authenticated using (dealer_id = auth.uid() and public.is_dealer());

create policy "orders: dealer read own" on public.orders
  for select to authenticated using (dealer_id = auth.uid() and public.is_dealer());
create policy "order_items: dealer read own" on public.order_items
  for select to authenticated using (
    public.is_dealer()
    and exists (select 1 from public.orders o where o.id = order_id and o.dealer_id = auth.uid())
  );
create policy "tickets: dealer read own" on public.tickets
  for select to authenticated using (
    public.is_dealer()
    and exists (select 1 from public.orders o where o.id = order_id and o.dealer_id = auth.uid())
  );
create policy "ticket_types: dealer read" on public.ticket_types
  for select to authenticated using (public.is_dealer());
create policy "payments: dealer read own top-ups" on public.payments
  for select to authenticated using (dealer_id = auth.uid() and public.is_dealer());

-- Staff see which dealer an order belongs to.
create policy "dealers: staff read" on public.dealers
  for select to authenticated using (public.is_staff());

-- Live balance in the dealer portal.
alter publication supabase_realtime add table public.wallet_ledger;
