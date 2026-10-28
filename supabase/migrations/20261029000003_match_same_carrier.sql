-- A refill was matched to any line with the same phone number or ICCID, on any carrier, and
-- a phone match counted even when the ICCIDs disagreed: an AT&T refill could take another
-- customer's T-Mobile plan end and start weeks late. A line now matches only on the same
-- carrier; an ICCID match wins; a phone match counts only when the ICCIDs do not disagree.

drop function if exists public.line_plan_end(text, text, uuid);
drop function if exists public.match_line(text, text);

-- Whether a SIM of ours is the line asked for (phone key and ICCID as given).
create or replace function public.same_line(i public.order_items, p_key text, p_iccid text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_iccid is not null and i.iccid = p_iccid)
      or (p_key is not null and i.phone_key = p_key and (p_iccid is null or i.iccid is null or i.iccid = p_iccid));
$$;

-- The last day a line has paid days for, over everything we sold or refilled on that carrier.
-- Null when we do not know (never ours, or never activated). Another order can be left out.
create or replace function public.line_plan_end(p_phone text, p_iccid text, p_exclude_order uuid, p_carrier_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(i.plan_ends_on)
    from public.order_items i
    join public.orders o on o.id = i.order_id
   where i.plan_ends_on is not null
     and i.status in ('fulfilled', 'replaced')
     and o.carrier_id = p_carrier_id
     and (p_exclude_order is null or i.order_id <> p_exclude_order)
     and public.same_line(i, public.phone_key(p_phone), nullif(regexp_replace(coalesce(p_iccid, ''), '\s', '', 'g'), ''));
$$;

-- The newest SIM of ours that is this line on this carrier, for linking a refill to it; an
-- ICCID match first.
create or replace function public.match_line(p_phone text, p_iccid text, p_carrier_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id
    from public.order_items i
    join public.orders o on o.id = i.order_id
   where i.status in ('fulfilled', 'replaced')
     and o.carrier_id = p_carrier_id
     and public.same_line(i, public.phone_key(p_phone), nullif(regexp_replace(coalesce(p_iccid, ''), '\s', '', 'g'), ''))
   order by (i.iccid is not distinct from nullif(regexp_replace(coalesce(p_iccid, ''), '\s', '', 'g'), '')) desc,
            coalesce(i.plan_ends_on, i.fulfilled_at::date) desc nulls last, i.created_at desc
   limit 1;
$$;

create or replace function public.refill_proposed_dates(p_item_id uuid)
returns table (current_ends_on date, starts_on date, ends_on date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item public.order_items;
  v_days integer;
  v_carrier uuid;
  v_end date;
  v_start date;
begin
  if not public.is_staff() and auth.role() <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_item from public.order_items where id = p_item_id;
  select days, carrier_id into v_days, v_carrier from public.orders where id = v_item.order_id;
  v_end := public.line_plan_end(v_item.phone_number, v_item.iccid, v_item.order_id, v_carrier);
  v_start := case when v_end is not null and v_end >= public.us_today() then v_end + 1 else public.us_today() end;
  return query select v_end, v_start, v_start + greatest(coalesce(v_days, 1) - 1, 0);
end;
$$;

create or replace function public.refill_dates_for_order(p_order_id uuid)
returns table (item_id uuid, current_ends_on date, starts_on date, ends_on date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_carrier uuid;
begin
  if not public.is_staff() and auth.role() <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select days, carrier_id into v_days, v_carrier from public.orders where id = p_order_id;
  return query
  with ends as (
    select i.id, public.line_plan_end(i.phone_number, i.iccid, p_order_id, v_carrier) as current_end
      from public.order_items i
     where i.order_id = p_order_id
  ), starts as (
    select e.id, e.current_end,
           case when e.current_end is not null and e.current_end >= public.us_today() then e.current_end + 1 else public.us_today() end as start_on
      from ends e
  )
  select s.id, s.current_end, s.start_on, s.start_on + greatest(coalesce(v_days, 1) - 1, 0)
    from starts s;
end;
$$;

create or replace function public.place_dealer_refill(p_lines jsonb, p_reference text default null)
returns public.order_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dealer public.dealers;
  v_profile public.profiles;
  v_addon public.addons;
  v_batch public.order_batches;
  v_order public.orders;
  v_line jsonb;
  v_number jsonb;
  v_pkg record;
  v_qty integer;
  v_unit integer;
  v_addon_price integer;
  v_line_total integer;
  v_total bigint := 0;
  v_count integer := 0;
  v_sims integer := 0;
  v_seq integer;
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
    raise exception 'at most 30 lines per refill' using errcode = 'P0001';
  end if;
  select * into v_addon from public.addons where code = 'intl_calling' and active;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce(jsonb_array_length(v_line -> 'numbers'), 0);
    if v_qty < 1 or v_qty > 500 then
      raise exception 'each line takes 1 to 500 numbers' using errcode = 'P0001';
    end if;
    for v_number in select * from jsonb_array_elements(v_line -> 'numbers') loop
      if public.phone_key(v_number ->> 'phone') is null or length(public.phone_key(v_number ->> 'phone')) not between 10 and 15 then
        raise exception 'a phone number in this refill is not valid' using errcode = 'P0001';
      end if;
    end loop;
    select dp.id, p.refillable into v_pkg
      from public.day_packages dp
      join public.plans p on p.id = dp.plan_id
      join public.carriers c on c.id = p.carrier_id
     where dp.id = (v_line ->> 'day_package_id')::uuid and dp.active and p.published and c.active;
    if v_pkg.id is null or not v_pkg.refillable then
      raise exception 'a plan in this refill is not offered for refills' using errcode = 'P0001';
    end if;
    v_unit := public.dealer_package_price(v_dealer.profile_id, v_pkg.id);
    if v_unit is null then
      raise exception 'a plan in this refill has no dealer price' using errcode = 'P0001';
    end if;
    if coalesce((v_line ->> 'intl_calling')::boolean, false) then
      if v_addon.id is null or v_addon.wholesale_price_cents is null then
        raise exception 'international calling is not available to dealers' using errcode = 'P0001';
      end if;
      v_addon_price := v_addon.wholesale_price_cents;
    else
      v_addon_price := 0;
    end if;
    v_total := v_total + (v_unit + v_addon_price)::bigint * v_qty;
    v_sims := v_sims + v_qty;
  end loop;

  if v_sims > 1000 then
    raise exception 'at most 1000 numbers per refill' using errcode = 'P0001';
  end if;
  select available_cents into v_available from public.dealer_wallet(v_dealer.profile_id);
  if v_total > v_available then
    raise exception 'not enough funds: this order is % and % is available', v_total, v_available using errcode = 'P0001';
  end if;

  insert into public.order_batches (dealer_id, reference, shipping_address, total_cents, created_by)
  values (v_dealer.profile_id, nullif(left(trim(coalesce(p_reference, '')), 80), ''), null, v_total, auth.uid())
  returning * into v_batch;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_count := v_count + 1;
    v_qty := jsonb_array_length(v_line -> 'numbers');
    select dp.id, dp.days, p.id as plan_id, p.name as plan_name, p.product_type, c.id as carrier_id, c.name as carrier_name
      into v_pkg
      from public.day_packages dp
      join public.plans p on p.id = dp.plan_id
      join public.carriers c on c.id = p.carrier_id
     where dp.id = (v_line ->> 'day_package_id')::uuid;
    v_unit := public.dealer_package_price(v_dealer.profile_id, v_pkg.id);
    v_addon_price := case when coalesce((v_line ->> 'intl_calling')::boolean, false) then v_addon.wholesale_price_cents else 0 end;
    v_line_total := (v_unit + v_addon_price) * v_qty;

    insert into public.orders (
      channel, status, payment_status, customer_name, customer_email, customer_phone,
      carrier_id, plan_id, day_package_id, addon_id, carrier_name, plan_name, product_type, days,
      addon_name, quantity, unit_price_cents, addon_price_cents, shipping_cents, sim_card_price_cents,
      network_fee_cents, total_cents, paid_at, batch_id, dealer_id, kind
    ) values (
      'dealer', 'queued', 'paid', v_dealer.company, v_profile.email, coalesce(nullif(v_dealer.phone, ''), '-'),
      v_pkg.carrier_id, v_pkg.plan_id, v_pkg.id,
      case when v_addon_price > 0 then v_addon.id else null end,
      v_pkg.carrier_name, v_pkg.plan_name, v_pkg.product_type, v_pkg.days,
      case when v_addon_price > 0 then v_addon.name else null end,
      v_qty, v_unit, v_addon_price, 0, 0, 0, v_line_total, now(), v_batch.id, v_dealer.profile_id, 'refill'
    ) returning * into v_order;

    v_seq := 0;
    for v_number in select * from jsonb_array_elements(v_line -> 'numbers') loop
      v_seq := v_seq + 1;
      insert into public.order_items (order_id, seq, phone_number, iccid, refill_of_item)
      values (
        v_order.id, v_seq,
        nullif(left(trim(v_number ->> 'phone'), 30), ''),
        nullif(left(regexp_replace(coalesce(v_number ->> 'iccid', ''), '\s', '', 'g'), 30), ''),
        public.match_line(v_number ->> 'phone', v_number ->> 'iccid', v_pkg.carrier_id)
      );
    end loop;

    if v_line_total > 0 then
      insert into public.wallet_ledger (dealer_id, kind, amount_cents, order_id, batch_id, created_by, note)
      values (v_dealer.profile_id, 'reserve', v_line_total, v_order.id, v_batch.id, auth.uid(),
              'Refill B-' || v_batch.number || ', line ' || v_count);
    end if;
  end loop;

  return v_batch;
end;
$$;

revoke all on function public.same_line(public.order_items, text, text) from public, anon, authenticated;
revoke all on function public.line_plan_end(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.line_plan_end(text, text, uuid, uuid) to service_role;
revoke all on function public.match_line(text, text, uuid) from public, anon, authenticated;
grant execute on function public.match_line(text, text, uuid) to service_role;
revoke all on function public.refill_proposed_dates(uuid) from public, anon;
revoke all on function public.place_dealer_refill(jsonb, text) from public, anon;
revoke all on function public.refill_dates_for_order(uuid) from public, anon;
