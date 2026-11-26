-- 26 Nov (Zafir): each dealer can have their own price for a service, like plans and SIM
-- cards: a special price per dealer, else the dealer price in Services, else not offered to
-- them. A number change can ask for a ZIP code and an area code for the new number.

create table public.dealer_service_prices (
  dealer_id uuid not null references public.dealers (profile_id) on delete cascade,
  carrier_id uuid not null references public.carriers (id) on delete cascade,
  service_code text not null references public.services (code) on delete cascade,
  price_cents integer not null check (price_cents >= 0),
  primary key (dealer_id, carrier_id, service_code)
);

alter table public.dealer_service_prices enable row level security;
create policy "dealer_service_prices: admin all" on public.dealer_service_prices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "dealer_service_prices: read own" on public.dealer_service_prices
  for select to authenticated using (dealer_id = auth.uid());

-- What a dealer pays for a service on one carrier, or null when it is not offered to them.
create or replace function public.dealer_service_price(p_dealer_id uuid, p_carrier_id uuid, p_service_code text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select price_cents from public.dealer_service_prices
      where dealer_id = p_dealer_id and carrier_id = p_carrier_id and service_code = p_service_code),
    cs.wholesale_price_cents
  )
    from public.carrier_services cs
    join public.carriers c on c.id = cs.carrier_id and c.active
   where cs.carrier_id = p_carrier_id and cs.service_code = p_service_code and cs.active;
$$;

revoke all on function public.dealer_service_price(uuid, uuid, text) from public, anon, authenticated;

-- The services a dealer can order, at their prices. Their own, or any dealer's for the owner.
create or replace function public.dealer_service_offers(p_dealer_id uuid default null)
returns table (carrier_id uuid, carrier_name text, service_code text, service_name text, description text, price_cents integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dealer uuid := coalesce(p_dealer_id, auth.uid());
begin
  if not ((v_dealer = auth.uid() and public.is_dealer()) or public.is_admin() or auth.role() = 'service_role') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select c.id, c.name, s.code, s.name, s.description, public.dealer_service_price(v_dealer, c.id, s.code)
    from public.carrier_services cs
    join public.carriers c on c.id = cs.carrier_id and c.active
    join public.services s on s.code = cs.service_code
   where cs.active and public.dealer_service_price(v_dealer, c.id, s.code) is not null
   order by s.display_order, c.display_order, c.name;
end;
$$;

revoke all on function public.dealer_service_offers(uuid) from public, anon;
grant execute on function public.dealer_service_offers(uuid) to authenticated;

drop function public.place_dealer_service(uuid, text, jsonb, text);

create or replace function public.place_dealer_service(
  p_carrier_id uuid,
  p_service_code text,
  p_numbers jsonb,
  p_reference text default null,
  p_zip_code text default null,
  p_area_code text default null
)
returns public.order_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dealer public.dealers;
  v_profile public.profiles;
  v_carrier public.carriers;
  v_service public.services;
  v_price integer;
  v_batch public.order_batches;
  v_order public.orders;
  v_number jsonb;
  v_qty integer;
  v_total bigint;
  v_available bigint;
  v_seq integer := 0;
  v_phone text;
  v_iccid text;
  v_zip text;
  v_area text;
begin
  if not public.is_dealer() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_dealer from public.dealers where profile_id = auth.uid() for update;
  select * into v_profile from public.profiles where id = auth.uid();
  if v_dealer.profile_id is null then
    raise exception 'dealer account not set up' using errcode = 'P0001';
  end if;

  select * into v_carrier from public.carriers where id = p_carrier_id and active;
  select * into v_service from public.services where code = p_service_code;
  v_price := public.dealer_service_price(v_dealer.profile_id, p_carrier_id, p_service_code);
  if v_carrier.id is null or v_service.code is null or v_price is null then
    raise exception 'this service is not offered for this carrier' using errcode = 'P0001';
  end if;

  -- A new number can be asked for in a ZIP code and area code; a QR code keeps the number.
  if p_service_code = 'number_change' then
    v_zip := nullif(trim(coalesce(p_zip_code, '')), '');
    v_area := nullif(trim(coalesce(p_area_code, '')), '');
    if v_zip is not null and v_zip !~ '^[0-9]{5}$' then
      raise exception 'a ZIP code is 5 digits' using errcode = 'P0001';
    end if;
    if v_area is not null and v_area !~ '^[2-9][0-9]{2}$' then
      raise exception 'an area code is 3 digits, for example 212' using errcode = 'P0001';
    end if;
  end if;

  v_qty := case when jsonb_typeof(p_numbers) = 'array' then jsonb_array_length(p_numbers) else 0 end;
  if v_qty < 1 or v_qty > 500 then
    raise exception 'add 1 to 500 numbers' using errcode = 'P0001';
  end if;
  for v_number in select * from jsonb_array_elements(p_numbers) loop
    if public.phone_key(v_number ->> 'phone') is null or length(public.phone_key(v_number ->> 'phone')) not between 10 and 15 then
      raise exception 'a phone number in this request is not valid' using errcode = 'P0001';
    end if;
  end loop;

  v_total := v_price::bigint * v_qty;
  select available_cents into v_available from public.dealer_wallet(v_dealer.profile_id);
  if v_total > v_available then
    raise exception 'not enough funds: this order is % and % is available', v_total, v_available using errcode = 'P0001';
  end if;

  insert into public.order_batches (dealer_id, reference, shipping_address, total_cents, created_by)
  values (v_dealer.profile_id, nullif(left(trim(coalesce(p_reference, '')), 80), ''), null, v_total, auth.uid())
  returning * into v_batch;

  insert into public.orders (
    channel, status, payment_status, customer_name, customer_email, customer_phone, zip_code, area_code,
    carrier_id, carrier_name, plan_name, product_type, days, quantity, unit_price_cents,
    addon_price_cents, shipping_cents, sim_card_price_cents, network_fee_cents, total_cents,
    paid_at, batch_id, dealer_id, kind, service_code
  ) values (
    'dealer', 'queued', 'paid', v_dealer.company, v_profile.email, coalesce(nullif(v_dealer.phone, ''), '-'), v_zip, v_area,
    v_carrier.id, v_carrier.name, v_service.name,
    case when v_service.code = 'esim_qr' then 'esim'::public.product_type else 'physical'::public.product_type end,
    null, v_qty, v_price, 0, 0, 0, 0, v_total, now(), v_batch.id, v_dealer.profile_id, 'service', v_service.code
  ) returning * into v_order;

  for v_number in select * from jsonb_array_elements(p_numbers) loop
    v_seq := v_seq + 1;
    v_phone := nullif(left(trim(v_number ->> 'phone'), 30), '');
    v_iccid := nullif(left(regexp_replace(coalesce(v_number ->> 'iccid', ''), '\s', '', 'g'), 30), '');
    insert into public.order_items (order_id, seq, phone_number, iccid, old_phone_number, old_iccid, refill_of_item)
    values (v_order.id, v_seq, v_phone, v_iccid, v_phone, v_iccid, public.match_line(v_phone, v_iccid, v_carrier.id));
  end loop;

  if v_total > 0 then
    insert into public.wallet_ledger (dealer_id, kind, amount_cents, order_id, batch_id, created_by, note)
    values (v_dealer.profile_id, 'reserve', v_total, v_order.id, v_batch.id, auth.uid(),
            v_service.name || ' B-' || v_batch.number);
  end if;

  return v_batch;
end;
$$;

revoke all on function public.place_dealer_service(uuid, text, jsonb, text, text, text) from public, anon;
grant execute on function public.place_dealer_service(uuid, text, jsonb, text, text, text) to authenticated;
