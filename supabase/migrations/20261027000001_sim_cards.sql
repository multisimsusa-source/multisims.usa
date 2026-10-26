-- MultiSims USA - SIM cards on their own (agreed 26 Oct 2026).
--
-- A physical SIM card can be bought without a plan, on the website and by dealers. Cards are
-- priced per carrier: a retail price, and a dealer price (per dealer, else the carrier's
-- default wholesale price). Every order now says what it is: a SIM with a plan ('line'), a
-- card on its own ('card_only'), and later a refill or the activation of a card. A card-only
-- order has no plan and no days; it ships and is done, and can be activated later.

-- SIM cards per carrier --------------------------------------------------------------------------

create table public.sim_cards (
  carrier_id uuid primary key references public.carriers (id) on delete cascade,
  price_cents integer not null check (price_cents >= 0),
  -- What dealers pay unless they have their own price; null = not offered to dealers.
  wholesale_price_cents integer check (wholesale_price_cents is null or wholesale_price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sim_cards_updated_at before update on public.sim_cards
  for each row execute function public.set_updated_at();

create table public.dealer_sim_card_prices (
  dealer_id uuid not null references public.dealers (profile_id) on delete cascade,
  carrier_id uuid not null references public.carriers (id) on delete cascade,
  price_cents integer not null check (price_cents >= 0),
  primary key (dealer_id, carrier_id)
);

-- One card per carrier that sells SIM card plans today, at today's prices. Carriers with only
-- eSIM plans get a card row switched off, ready for the owner to price and switch on.
insert into public.sim_cards (carrier_id, price_cents, wholesale_price_cents, active)
select c.id, s.sim_card_price_cents, s.dealer_sim_card_price_cents,
       exists (select 1 from public.plans p where p.carrier_id = c.id and p.product_type = 'physical' and p.published)
  from public.carriers c
 cross join public.settings s
 where s.id;

-- A dealer's own card price applied to every carrier, as before.
insert into public.dealer_sim_card_prices (dealer_id, carrier_id, price_cents)
select d.profile_id, sc.carrier_id, d.sim_card_price_cents
  from public.dealers d
  join public.sim_cards sc on true
 where d.sim_card_price_cents is not null;

alter table public.sim_cards enable row level security;
alter table public.dealer_sim_card_prices enable row level security;
create policy "sim_cards: admin all" on public.sim_cards
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "sim_cards: staff read" on public.sim_cards
  for select to authenticated using (public.is_staff());
create policy "dealer_sim_card_prices: admin all" on public.dealer_sim_card_prices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "dealer_sim_card_prices: read own" on public.dealer_sim_card_prices
  for select to authenticated using (dealer_id = auth.uid());

-- The card price a dealer pays for a carrier, or null when cards of that carrier are not
-- offered to them.
create or replace function public.dealer_sim_card_price(p_dealer_id uuid, p_carrier_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when sc.active and c.active then
           coalesce(
             (select price_cents from public.dealer_sim_card_prices where dealer_id = p_dealer_id and carrier_id = p_carrier_id),
             sc.wholesale_price_cents
           )
         end
    from public.sim_cards sc
    join public.carriers c on c.id = sc.carrier_id
   where sc.carrier_id = p_carrier_id;
$$;

-- The SIM cards a dealer can order on their own, at their price.
create or replace function public.dealer_sim_cards(p_dealer_id uuid default null)
returns table (carrier_id uuid, carrier_name text, carrier_order integer, price_cents integer)
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
  select c.id, c.name, c.display_order, public.dealer_sim_card_price(v_dealer, c.id)
    from public.sim_cards sc
    join public.carriers c on c.id = sc.carrier_id
   where sc.active and c.active
     and public.dealer_sim_card_price(v_dealer, c.id) is not null
   order by c.display_order, c.name;
end;
$$;

-- What an order is -------------------------------------------------------------------------------

alter table public.orders
  add column kind text not null default 'line'
    check (kind in ('line', 'card_only', 'refill', 'activation'));

alter table public.orders
  alter column plan_id drop not null,
  alter column day_package_id drop not null,
  alter column plan_name drop not null,
  alter column days drop not null,
  add constraint orders_kind_plan_check
    check (kind = 'card_only' or (plan_id is not null and day_package_id is not null and plan_name is not null and days is not null)),
  add constraint orders_card_only_check
    check (kind <> 'card_only' or (product_type = 'physical' and plan_id is null and days is null));

-- "2 x AT&T SIM card" for a card on its own, "2 x AT&T Unlimited, 30 days" otherwise.
create or replace function public.order_line_text(o public.orders)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when o.days is null then o.quantity || ' x ' || o.carrier_name || ' SIM card'
    else o.quantity || ' x ' || o.carrier_name || ' ' || o.plan_name || ', ' || o.days || (case when o.days = 1 then ' day' else ' days' end)
  end;
$$;

-- Filling a card-only order: ICCID and tracking on every card, then it is shipped and done.
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

    if v_order.kind = 'card_only' then
      update public.orders
         set status = 'fulfilled', shipped_at = now(), fulfilled_at = now(), attention_reason = null
       where id = p_order_id
      returning * into v_order;
    else
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
  else
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
  end if;

  if v_order.replaces_item_id is not null then
    select id into v_new_item from public.order_items where order_id = p_order_id order by seq limit 1;
    update public.order_items
       set status = 'replaced', replaced_at = now(), replaced_by_item = v_new_item
     where id = v_order.replaces_item_id and status = 'fulfilled';
  end if;

  return v_order;
end;
$$;

-- Replacements copy what the order is.
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
  v_root uuid;
  v_hold boolean;
  v_limit integer;
  v_used integer;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_item from public.order_items where id = p_item_id;
  if v_item.id is null or v_item.status <> 'fulfilled' then
    raise exception 'only a delivered SIM can be replaced' using errcode = 'P0001';
  end if;
  select * into v_src from public.orders where id = v_item.order_id;
  v_root := coalesce(v_src.replacement_of, v_src.id);

  perform 1 from public.orders where id = v_root for update;

  if exists (
    select 1 from public.orders
     where replaces_item_id = p_item_id and status not in ('fulfilled', 'cancelled')
  ) then
    raise exception 'a replacement for this SIM is already open' using errcode = 'P0001';
  end if;

  select replacement_needs_approval and not public.is_admin(), max_replacements_per_order
    into v_hold, v_limit
    from public.settings where id;

  select count(*) into v_used
    from public.orders
   where replacement_of = v_root and status <> 'cancelled';
  if v_used >= coalesce(v_limit, 2) then
    raise exception 'this order has reached its replacement limit (%)', coalesce(v_limit, 2) using errcode = 'P0001';
  end if;

  insert into public.orders (
    channel, status, payment_status, customer_name, customer_email, customer_phone, zip_code,
    area_code, shipping_address, carrier_id, plan_id, day_package_id, addon_id, carrier_name,
    plan_name, product_type, days, addon_name, quantity, unit_price_cents, addon_price_cents,
    shipping_cents, total_cents, paid_at, replacement_of, replaces_item_id, ticket_id, batch_id, dealer_id, kind
  ) values (
    v_src.channel,
    case when coalesce(v_hold, false) then 'awaiting_approval'::public.order_status else 'queued'::public.order_status end,
    'not_required', v_src.customer_name, v_src.customer_email, v_src.customer_phone, v_src.zip_code,
    v_src.area_code, v_src.shipping_address, v_src.carrier_id, v_src.plan_id, v_src.day_package_id,
    v_src.addon_id, v_src.carrier_name, v_src.plan_name, v_src.product_type, v_src.days, v_src.addon_name,
    1, 0, 0, 0, 0, now(), v_root, p_item_id, p_ticket_id, v_src.batch_id, v_src.dealer_id, v_src.kind
  ) returning * into v_new;

  insert into public.order_items (order_id, seq) values (v_new.id, 1);

  if p_ticket_id is not null then
    update public.tickets set status = 'in_progress' where id = p_ticket_id and status = 'open';
  end if;
  return v_new;
end;
$$;

-- Dealer batches: a line is a plan ({ day_package_id, quantity, intl_calling }) or SIM cards
-- on their own ({ sim_card_carrier_id, quantity }). Cards of every line ship together, with
-- one shipping charge. A plan line's cards cost the dealer's card price for that carrier.
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
  v_card record;
  v_is_card boolean;
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
    v_is_card := v_line ? 'sim_card_carrier_id';

    if v_is_card then
      v_sim := public.dealer_sim_card_price(v_dealer.profile_id, (v_line ->> 'sim_card_carrier_id')::uuid);
      if v_sim is null then
        raise exception 'a SIM card in this order has no dealer price' using errcode = 'P0001';
      end if;
      v_has_physical := true;
      v_total := v_total + v_sim::bigint * v_qty;
    else
      select dp.id, dp.days, p.product_type, p.carrier_id into v_pkg
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
        v_sim := coalesce(
          public.dealer_sim_card_price(v_dealer.profile_id, v_pkg.carrier_id),
          v_dealer.sim_card_price_cents,
          v_settings.dealer_sim_card_price_cents
        );
      else
        v_sim := 0;
      end if;

      v_total := v_total + (v_unit + v_addon_price + v_sim)::bigint * v_qty;
    end if;
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
    v_is_card := v_line ? 'sim_card_carrier_id';
    -- Shipping is charged once per batch, on its first SIM card line.
    v_shipping := 0;

    if v_is_card then
      select c.id, c.name into v_card from public.carriers c where c.id = (v_line ->> 'sim_card_carrier_id')::uuid;
      v_sim := public.dealer_sim_card_price(v_dealer.profile_id, v_card.id);
      if not v_shipping_taken then
        v_shipping := v_settings.shipping_fee_cents;
        v_shipping_taken := true;
      end if;
      v_line_total := v_sim * v_qty + v_shipping;

      insert into public.orders (
        channel, status, payment_status, customer_name, customer_email, customer_phone,
        shipping_address, carrier_id, carrier_name, product_type, quantity, unit_price_cents,
        addon_price_cents, shipping_cents, sim_card_price_cents, network_fee_cents, total_cents,
        paid_at, batch_id, dealer_id, kind
      ) values (
        'dealer', 'queued', 'paid', v_dealer.company, v_profile.email, coalesce(nullif(v_dealer.phone, ''), '-'),
        p_address, v_card.id, v_card.name, 'physical', v_qty, 0,
        0, v_shipping, v_sim, 0, v_line_total,
        now(), v_batch.id, v_dealer.profile_id, 'card_only'
      ) returning * into v_order;
    else
      select dp.id, dp.days, p.id as plan_id, p.name as plan_name, p.product_type, c.id as carrier_id, c.name as carrier_name
        into v_pkg
        from public.day_packages dp
        join public.plans p on p.id = dp.plan_id
        join public.carriers c on c.id = p.carrier_id
       where dp.id = (v_line ->> 'day_package_id')::uuid;

      v_unit := public.dealer_package_price(v_dealer.profile_id, v_pkg.id);
      v_addon_price := case when coalesce((v_line ->> 'intl_calling')::boolean, false) then v_addon.wholesale_price_cents else 0 end;
      v_sim := case when v_pkg.product_type = 'physical' then coalesce(
                 public.dealer_sim_card_price(v_dealer.profile_id, v_pkg.carrier_id),
                 v_dealer.sim_card_price_cents,
                 v_settings.dealer_sim_card_price_cents
               ) else 0 end;
      if v_pkg.product_type = 'physical' and not v_shipping_taken then
        v_shipping := v_settings.shipping_fee_cents;
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
    end if;

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

revoke all on function public.dealer_sim_card_price(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dealer_sim_card_price(uuid, uuid) to service_role;
revoke all on function public.dealer_sim_cards(uuid) from public, anon;

-- Dealer notices: a card-only line is done once posted, so it says "posted", not "delivered".
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
    if new.status = 'shipped' or (new.status = 'fulfilled' and new.kind = 'card_only') then
      perform public.notify_user(new.dealer_id, 'line_shipped', 'SIM cards posted: ' || v_label, public.order_line_text(new), '/dealer/orders/' || new.batch_id);
    elsif new.status = 'fulfilled' then
      perform public.notify_user(new.dealer_id, 'line_delivered', 'Delivered: ' || v_label, public.order_line_text(new), '/dealer/orders/' || new.batch_id);
    end if;
  end if;
  return new;
end;
$$;
