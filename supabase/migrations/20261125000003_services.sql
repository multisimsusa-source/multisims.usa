-- 25 Nov: services on a line the customer already has, priced per carrier by the owner.
--   eSIM QR code: a QR to install the line as an eSIM (a SIM card line moving to eSIM, or a
--                 lost QR). Delivered when the agent adds the QR.
--   Number change: a new phone number on the same line. Delivered when the agent saves the
--                  new number; the line keeps its plan and dates.
-- Website customers pay the fee up front like a refill. Dealers order in bulk from their
-- wallet: the fee is held when they ask and taken per number once it is delivered, so a
-- number that cannot be done costs nothing.

create table public.services (
  code text primary key check (code in ('esim_qr', 'number_change')),
  name text not null check (length(trim(name)) between 1 and 60),
  description text not null default '' check (length(description) <= 300),
  display_order integer not null default 0
);

insert into public.services (code, name, description, display_order) values
  ('esim_qr', 'eSIM QR code', 'A QR code to install the line as an eSIM: for a SIM card line moving to eSIM, or a QR code that was lost.', 1),
  ('number_change', 'Number change', 'A new phone number on the same line. The plan and its days stay the same.', 2);

create table public.carrier_services (
  carrier_id uuid not null references public.carriers (id) on delete cascade,
  service_code text not null references public.services (code) on delete cascade,
  price_cents integer not null check (price_cents >= 0),
  -- What dealers pay; null means the service is not offered to dealers for this carrier.
  wholesale_price_cents integer check (wholesale_price_cents is null or wholesale_price_cents >= 0),
  active boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (carrier_id, service_code)
);

create trigger carrier_services_updated_at before update on public.carrier_services
  for each row execute function public.set_updated_at();

alter table public.services enable row level security;
alter table public.carrier_services enable row level security;

create policy "services: read" on public.services for select using (true);
create policy "carrier_services: read offered" on public.carrier_services
  for select using (active or public.is_admin());
create policy "carrier_services: admin write" on public.carrier_services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Orders: a service order names its service; it has no plan and no days.
alter table public.orders add column service_code text references public.services (code) on delete restrict;

alter table public.orders drop constraint orders_kind_check;
alter table public.orders add constraint orders_kind_check
  check (kind in ('line', 'card_only', 'refill', 'activation', 'service'));
alter table public.orders add constraint orders_service_check
  check ((kind = 'service') = (service_code is not null));
alter table public.orders drop constraint orders_kind_plan_check;
alter table public.orders add constraint orders_kind_plan_check
  check (kind in ('card_only', 'service') or (plan_name is not null and days is not null));
alter table public.orders drop constraint orders_check;
alter table public.orders add constraint orders_check
  check (product_type <> 'physical' or shipping_address is not null or replacement_of is not null
         or kind in ('refill', 'activation', 'service'));

-- The number and ICCID the customer gave, kept when the agent saves the new ones.
alter table public.order_items
  add column old_phone_number text check (old_phone_number is null or length(old_phone_number) <= 30),
  add column old_iccid text check (old_iccid is null or length(old_iccid) <= 30);

-- "2 x T-Mobile Number change" for a service.
create or replace function public.order_line_text(o public.orders)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when o.kind = 'service' then o.quantity || ' x ' || o.carrier_name || ' ' || o.plan_name
    when o.days is null then o.quantity || ' x ' || o.carrier_name || ' SIM card'
    else o.quantity || ' x ' || o.carrier_name || ' ' || o.plan_name || ', ' || o.days || (case when o.days = 1 then ' day' else ' days' end)
  end;
$$;

-- A dealer asks for one service on many numbers of one carrier. One order in its own batch,
-- the fee held on the wallet and taken per number as each is delivered.
create or replace function public.place_dealer_service(
  p_carrier_id uuid,
  p_service_code text,
  p_numbers jsonb,
  p_reference text default null
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
  select cs.wholesale_price_cents into v_price
    from public.carrier_services cs
   where cs.carrier_id = p_carrier_id and cs.service_code = p_service_code and cs.active;
  if v_carrier.id is null or v_service.code is null or v_price is null then
    raise exception 'this service is not offered for this carrier' using errcode = 'P0001';
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
    channel, status, payment_status, customer_name, customer_email, customer_phone,
    carrier_id, carrier_name, plan_name, product_type, days, quantity, unit_price_cents,
    addon_price_cents, shipping_cents, sim_card_price_cents, network_fee_cents, total_cents,
    paid_at, batch_id, dealer_id, kind, service_code
  ) values (
    'dealer', 'queued', 'paid', v_dealer.company, v_profile.email, coalesce(nullif(v_dealer.phone, ''), '-'),
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

revoke all on function public.place_dealer_service(uuid, text, jsonb, text) from public, anon;
grant execute on function public.place_dealer_service(uuid, text, jsonb, text) to authenticated;

-- What one SIM of a service order needs before it is done.
create or replace function public.service_item_ready(p_code text, i public.order_items)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_code
    when 'esim_qr' then i.qr_path is not null
    when 'number_change' then i.phone_number is not null
      and coalesce(public.phone_key(i.phone_number), '') <> coalesce(public.phone_key(i.old_phone_number), '')
    else false
  end;
$$;

-- A delivered number change: the line we know of carries the new number from now on, so a
-- later refill or service finds it.
create or replace function public.service_item_done(p_code text, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.order_items;
begin
  if p_code <> 'number_change' then
    return;
  end if;
  select * into v_item from public.order_items where id = p_item_id;
  if v_item.refill_of_item is not null then
    update public.order_items set phone_number = v_item.phone_number where id = v_item.refill_of_item;
  end if;
end;
$$;

revoke all on function public.service_item_done(text, uuid) from public, anon, authenticated;


-- Completing a service order: every number has its QR code, or its new number.
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
  v_today date := public.us_today();
  v_replaced_end date;
  v_item record;
  v_dates record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null
     or v_order.status not in ('claimed', 'needs_attention')
     or not public.is_staff()
     or not (v_order.claimed_by = auth.uid() or public.is_admin()) then
    raise exception 'claim the order first' using errcode = 'P0001';
  end if;

  if v_order.replaces_item_id is not null then
    select plan_ends_on into v_replaced_end from public.order_items where id = v_order.replaces_item_id;
  end if;

  if v_order.kind = 'refill' then
    -- Dates the agent did not set: the proposal, as of now.
    for v_item in select id from public.order_items where order_id = p_order_id and status = 'pending' and plan_ends_on is null loop
      select * into v_dates from public.refill_proposed_dates(v_item.id);
      update public.order_items set plan_starts_on = v_dates.starts_on, plan_ends_on = v_dates.ends_on where id = v_item.id;
    end loop;
    update public.order_items
       set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid()
     where order_id = p_order_id and status = 'pending';
    update public.orders
       set status = 'fulfilled', fulfilled_at = now(), attention_reason = null
     where id = p_order_id
    returning * into v_order;
    return v_order;
  end if;

  if v_order.kind = 'service' then
    select count(*) into v_missing
      from public.order_items i
     where i.order_id = p_order_id and i.status = 'pending' and not public.service_item_ready(v_order.service_code, i);
    if v_missing > 0 then
      raise exception 'missing details on % item(s)', v_missing using errcode = 'P0001';
    end if;
    for v_item in select id from public.order_items where order_id = p_order_id and status = 'pending' loop
      perform public.service_item_done(v_order.service_code, v_item.id);
    end loop;
    update public.order_items
       set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid()
     where order_id = p_order_id and status = 'pending';
    update public.orders
       set status = 'fulfilled', fulfilled_at = now(), attention_reason = null
     where id = p_order_id
    returning * into v_order;
    return v_order;
  end if;

  if v_order.kind = 'activation' then
    select count(*) into v_missing
      from public.order_items
     where order_id = p_order_id and status = 'pending' and (phone_number is null or iccid is null);
    if v_missing > 0 then
      raise exception 'missing details on % item(s)', v_missing using errcode = 'P0001';
    end if;
    update public.order_items
       set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid(),
           plan_starts_on = coalesce(plan_starts_on, v_today),
           plan_ends_on = coalesce(plan_ends_on, coalesce(plan_starts_on, v_today) + greatest(v_order.days - 1, 0))
     where order_id = p_order_id and status = 'pending';
    update public.orders
       set status = 'fulfilled', fulfilled_at = now(), attention_reason = null
     where id = p_order_id
    returning * into v_order;
    return v_order;
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
      v_due := v_order.plan_start = 'on_date' and v_order.activate_on <= v_today;
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
    -- A SIM card's line needs its number; an eSIM's QR may follow after delivery.
    if v_order.product_type = 'physical' then
      select count(*) into v_missing
        from public.order_items
       where order_id = p_order_id and status = 'fulfilled' and phone_number is null;
    else
      v_missing := 0;
    end if;
    if v_missing > 0 then
      raise exception 'missing details on % item(s)', v_missing using errcode = 'P0001';
    end if;

    -- The plan starts now: eSIMs delivered today, SIM cards whose line starts today.
    update public.order_items
       set plan_starts_on = coalesce(plan_starts_on, v_today),
           plan_ends_on = coalesce(plan_ends_on, v_replaced_end, v_today + greatest(coalesce(v_order.days, 1) - 1, 0))
     where order_id = p_order_id
       and v_order.days is not null
       and (status = 'pending' or (v_order.phase = 'activate' and status = 'fulfilled'));

    update public.order_items
       set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid()
     where order_id = p_order_id and status = 'pending';

    if v_order.product_type = 'physical' and v_order.phase = 'activate' then
      update public.order_items
         set activated_at = coalesce(activated_at, now())
       where order_id = p_order_id and status = 'fulfilled';
    end if;

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

-- Part of a bulk service request can go out first, as for SIMs.
create or replace function public.deliver_ready_items(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_today date := public.us_today();
  v_ready integer;
  v_left integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null
     or v_order.status not in ('claimed', 'needs_attention')
     or not public.is_staff()
     or not (v_order.claimed_by = auth.uid() or public.is_admin()) then
    raise exception 'claim the order first' using errcode = 'P0001';
  end if;
  if v_order.kind = 'refill' or v_order.replaces_item_id is not null then
    raise exception 'this order is completed in one step' using errcode = 'P0001';
  end if;

  if v_order.kind = 'service' then
    select count(*) filter (where public.service_item_ready(v_order.service_code, i)),
           count(*) filter (where not public.service_item_ready(v_order.service_code, i))
      into v_ready, v_left
      from public.order_items i
     where i.order_id = p_order_id and i.status = 'pending';
  elsif v_order.product_type = 'physical' and v_order.phase = 'activate' and v_order.kind <> 'activation' then
    select count(*) filter (where phone_number is not null), count(*) filter (where phone_number is null)
      into v_ready, v_left
      from public.order_items
     where order_id = p_order_id and status = 'fulfilled' and activated_at is null;
  elsif v_order.kind = 'activation' then
    select count(*) filter (where phone_number is not null and iccid is not null),
           count(*) filter (where phone_number is null or iccid is null)
      into v_ready, v_left
      from public.order_items
     where order_id = p_order_id and status = 'pending';
  elsif v_order.product_type = 'physical' then
    select count(*) filter (where tracking_number is not null and iccid is not null),
           count(*) filter (where tracking_number is null or iccid is null)
      into v_ready, v_left
      from public.order_items
     where order_id = p_order_id and status = 'pending';
  else
    select count(*) filter (where qr_path is not null or phone_number is not null),
           count(*) filter (where qr_path is null and phone_number is null)
      into v_ready, v_left
      from public.order_items
     where order_id = p_order_id and status = 'pending';
  end if;

  if v_ready = 0 then
    raise exception 'no SIM is ready yet' using errcode = 'P0001';
  end if;
  if v_left = 0 then
    raise exception 'every SIM is ready: complete the order instead' using errcode = 'P0001';
  end if;

  if v_order.kind = 'service' then
    perform public.service_item_done(v_order.service_code, i.id)
       from public.order_items i
      where i.order_id = p_order_id and i.status = 'pending' and public.service_item_ready(v_order.service_code, i);
    update public.order_items i
       set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid()
     where i.order_id = p_order_id and i.status = 'pending' and public.service_item_ready(v_order.service_code, i);
  elsif v_order.product_type = 'physical' and v_order.phase = 'activate' and v_order.kind <> 'activation' then
    update public.order_items
       set activated_at = now(),
           plan_starts_on = coalesce(plan_starts_on, v_today),
           plan_ends_on = coalesce(plan_ends_on, coalesce(plan_starts_on, v_today) + greatest(coalesce(v_order.days, 1) - 1, 0))
     where order_id = p_order_id and status = 'fulfilled' and activated_at is null and phone_number is not null;
  elsif v_order.kind = 'activation' then
    update public.order_items
       set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid(),
           plan_starts_on = coalesce(plan_starts_on, v_today),
           plan_ends_on = coalesce(plan_ends_on, coalesce(plan_starts_on, v_today) + greatest(coalesce(v_order.days, 1) - 1, 0))
     where order_id = p_order_id and status = 'pending' and phone_number is not null and iccid is not null;
  elsif v_order.product_type = 'physical' then
    update public.order_items
       set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid()
     where order_id = p_order_id and status = 'pending' and tracking_number is not null and iccid is not null;
  else
    update public.order_items
       set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid(),
           plan_starts_on = case when v_order.days is null then plan_starts_on else coalesce(plan_starts_on, v_today) end,
           plan_ends_on = case when v_order.days is null then plan_ends_on
                               else coalesce(plan_ends_on, v_today + greatest(v_order.days - 1, 0)) end
     where order_id = p_order_id and status = 'pending' and (qr_path is not null or phone_number is not null);
  end if;

  update public.orders set updated_at = now() where id = p_order_id;
  return v_ready;
end;
$$;
