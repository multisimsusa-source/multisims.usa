-- 13 Nov (Zafir): one plan can be sold as an eSIM, a SIM card, or both, instead of two copies of
-- the same plan. One set of day prices; a SIM card still adds the carrier's card price and
-- shipping. The buyer (or dealer, per line) chooses, and the order keeps the choice in
-- orders.product_type, which everything after checkout already uses. plans.product_type stays
-- as the plan's first product (eSIM when it sells both), kept in step by a trigger.

alter table public.plans
  add column sells_esim boolean,
  add column sells_sim boolean;
update public.plans set sells_esim = (product_type = 'esim'), sells_sim = (product_type = 'physical');
alter table public.plans
  alter column sells_esim set not null,
  alter column sells_sim set not null,
  alter column sells_esim set default true,
  alter column sells_sim set default false,
  add constraint plans_sells_something check (sells_esim or sells_sim);

create or replace function public.plans_product_from_sells()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Code that only sets product_type (older admin code, scripts): follow it.
  if tg_op = 'INSERT' then
    if new.product_type = 'physical' and new.sells_esim and not new.sells_sim then
      new.sells_esim := false;
      new.sells_sim := true;
    end if;
  elsif new.product_type is distinct from old.product_type
        and new.sells_esim = old.sells_esim and new.sells_sim = old.sells_sim then
    new.sells_esim := new.product_type = 'esim';
    new.sells_sim := new.product_type = 'physical';
  end if;
  new.product_type := case when new.sells_esim then 'esim'::public.product_type else 'physical'::public.product_type end;
  return new;
end;
$$;
create trigger plans_product_from_sells before insert or update of sells_esim, sells_sim, product_type on public.plans
  for each row execute function public.plans_product_from_sells();

-- Dealers see which products each plan sells.
drop function if exists public.dealer_catalog(uuid);
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
  retail_price_cents integer,
  plan_type text,
  sells_esim boolean,
  sells_sim boolean
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
         dp.days, public.dealer_package_price(v_dealer, dp.id), dp.price_cents, p.plan_type, p.sells_esim, p.sells_sim
    from public.day_packages dp
    join public.plans p on p.id = dp.plan_id
    join public.carriers c on c.id = p.carrier_id
   where dp.active and p.published and c.active
     and public.dealer_package_price(v_dealer, dp.id) is not null
   order by c.display_order, c.name, p.display_order, p.name, dp.days;
end;
$$;
revoke all on function public.dealer_catalog(uuid) from public, anon;

-- A dealer's plan line says which product it is (`product`: esim or physical); without it, the
-- plan's first product, as before.
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
  v_dev record;
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
      select dp.id, dp.days, (case
               when coalesce(v_line ->> 'product', '') = '' then p.product_type
               when v_line ->> 'product' = 'esim' and p.sells_esim then 'esim'::public.product_type
               when v_line ->> 'product' = 'physical' and p.sells_sim then 'physical'::public.product_type
             end) as product_type, p.carrier_id into v_pkg
        from public.day_packages dp
        join public.plans p on p.id = dp.plan_id
        join public.carriers c on c.id = p.carrier_id
       where dp.id = (v_line ->> 'day_package_id')::uuid and dp.active and p.published and c.active;
      if v_pkg.id is null then
        raise exception 'a plan in this order is no longer available' using errcode = 'P0001';
      end if;
      if v_pkg.product_type is null then
        raise exception 'a plan in this order is not sold as that product' using errcode = 'P0001';
      end if;
      -- Where the number should be from: optional, as on the website.
      if coalesce(v_line ->> 'zip_code', '') !~ '^([0-9]{5})?$' then
        raise exception 'a ZIP code must be 5 digits' using errcode = 'P0001';
      end if;
      if coalesce(v_line ->> 'area_code', '') !~ '^([2-9][0-9]{2})?$' then
        raise exception 'an area code is 3 digits, for example 212' using errcode = 'P0001';
      end if;
      -- Device details, one row per SIM in order: optional, never more rows than SIMs.
      if v_line ? 'devices' then
        if jsonb_typeof(v_line -> 'devices') <> 'array' or jsonb_array_length(v_line -> 'devices') > v_qty then
          raise exception 'a line has more device rows than SIMs' using errcode = 'P0001';
        end if;
        for v_dev in select value, n from jsonb_array_elements(v_line -> 'devices') with ordinality as d(value, n) loop
          if coalesce(v_dev.value ->> 'imei', '') !~ '^([0-9]{15})?$' then
            raise exception 'device row % has an IMEI that is not 15 digits', v_dev.n using errcode = 'P0001';
          end if;
          if coalesce(v_dev.value ->> 'eid', '') !~ '^([0-9]{32})?$' then
            raise exception 'device row % has an EID that is not 32 digits', v_dev.n using errcode = 'P0001';
          end if;
          if coalesce(v_dev.value ->> 'buyer_iccid', '') !~ '^([0-9]{18,22}[Ff]?)?$' then
            raise exception 'device row % has an ICCID that is not 18 to 22 digits', v_dev.n using errcode = 'P0001';
          end if;
        end loop;
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
      select dp.id, dp.days, p.id as plan_id, p.name as plan_name, (case
               when coalesce(v_line ->> 'product', '') = '' then p.product_type
               when v_line ->> 'product' = 'esim' and p.sells_esim then 'esim'::public.product_type
               when v_line ->> 'product' = 'physical' and p.sells_sim then 'physical'::public.product_type
             end) as product_type, c.id as carrier_id, c.name as carrier_name
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
        sim_card_price_cents, network_fee_cents, total_cents, paid_at, plan_start, batch_id, dealer_id,
        zip_code, area_code
      ) values (
        'dealer', 'queued', 'paid', v_dealer.company, v_profile.email, coalesce(nullif(v_dealer.phone, ''), '-'),
        case when v_pkg.product_type = 'physical' then p_address else null end,
        v_pkg.carrier_id, v_pkg.plan_id, v_pkg.id,
        case when v_addon_price > 0 then v_addon.id else null end,
        v_pkg.carrier_name, v_pkg.plan_name, v_pkg.product_type, v_pkg.days,
        case when v_addon_price > 0 then v_addon.name else null end,
        v_qty, v_unit, v_addon_price, v_shipping, v_sim, 0, v_line_total, now(),
        case when v_pkg.product_type = 'physical' then 'on_receipt' else null end,
        v_batch.id, v_dealer.profile_id,
        nullif(v_line ->> 'zip_code', ''), nullif(v_line ->> 'area_code', '')
      ) returning * into v_order;
    end if;

    insert into public.order_items (order_id, seq, imei, eid, buyer_iccid)
    select v_order.id, g,
           nullif(d.value ->> 'imei', ''), nullif(d.value ->> 'eid', ''), nullif(d.value ->> 'buyer_iccid', '')
      from generate_series(1, v_qty) g
      left join jsonb_array_elements(
             case when jsonb_typeof(v_line -> 'devices') = 'array' then v_line -> 'devices' else '[]'::jsonb end
           ) with ordinality as d(value, n) on d.n = g;

    if v_line_total > 0 then
      insert into public.wallet_ledger (dealer_id, kind, amount_cents, order_id, batch_id, created_by, note)
      values (v_dealer.profile_id, 'reserve', v_line_total, v_order.id, v_batch.id, auth.uid(),
              'Order B-' || v_batch.number || ', line ' || v_count);
    end if;
  end loop;

  return v_batch;
end;
$$;
