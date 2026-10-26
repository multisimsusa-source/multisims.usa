-- MultiSims USA - Refill, activating a SIM card bought on its own, and the plan timer
-- (agreed 26 Oct 2026).
--
-- A refill adds plan days to a number that is already active: same SIM, same number. It is
-- an order of kind 'refill', one SIM per number, filled by agents in the same queue. If the
-- number's current plan is still running, the refill starts the day after it ends;
-- otherwise on the day the agent completes it. An 'activation' starts a SIM card that was
-- bought on its own (here or elsewhere): the ICCID is given, the agent adds the number.
-- Every activated SIM now carries plan_starts_on and plan_ends_on, the timer customers,
-- dealers, agents and the owner see.

-- Which plans can be bought as a refill or to activate a card -----------------------------------

alter table public.plans add column refillable boolean not null default false;

-- Plan dates and the number a SIM belongs to -------------------------------------------------------

-- Digits only, and a US number without its leading 1, so "+1 (212) 555-0100" and
-- "212 555 0100" are the same number.
create or replace function public.phone_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d = '' then null
    when length(d) = 11 and left(d, 1) = '1' then substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

alter table public.order_items
  add column plan_starts_on date,
  add column plan_ends_on date,
  -- A refill: the SIM it adds days to, when we sold it or refilled it before.
  add column refill_of_item uuid references public.order_items (id) on delete set null,
  add column phone_key text generated always as (public.phone_key(phone_number)) stored,
  add constraint order_items_plan_dates_check check (plan_ends_on is null or plan_starts_on is null or plan_ends_on >= plan_starts_on);

create index order_items_phone_key_idx on public.order_items (phone_key) where phone_key is not null;
create index order_items_plan_ends_idx on public.order_items (plan_ends_on) where plan_ends_on is not null;

-- The last day a number or ICCID has paid days for, over everything we sold or refilled.
-- Null when we do not know (never ours, or never activated). Another order can be left out.
create or replace function public.line_plan_end(p_phone text, p_iccid text, p_exclude_order uuid default null)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(i.plan_ends_on)
    from public.order_items i
   where i.plan_ends_on is not null
     and i.status in ('fulfilled', 'replaced')
     and (p_exclude_order is null or i.order_id <> p_exclude_order)
     and (
       (public.phone_key(p_phone) is not null and i.phone_key = public.phone_key(p_phone))
       or (nullif(regexp_replace(coalesce(p_iccid, ''), '\s', '', 'g'), '') is not null
           and i.iccid = regexp_replace(p_iccid, '\s', '', 'g'))
     );
$$;

-- The newest SIM of ours with this number or ICCID, for linking a refill to it.
create or replace function public.match_line(p_phone text, p_iccid text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id
    from public.order_items i
   where i.status in ('fulfilled', 'replaced')
     and (
       (public.phone_key(p_phone) is not null and i.phone_key = public.phone_key(p_phone))
       or (nullif(regexp_replace(coalesce(p_iccid, ''), '\s', '', 'g'), '') is not null
           and i.iccid = regexp_replace(p_iccid, '\s', '', 'g'))
     )
   order by coalesce(i.plan_ends_on, i.fulfilled_at::date) desc nulls last, i.created_at desc
   limit 1;
$$;

-- The dates a refill proposes, as of today: the day after the current plan ends when it is
-- still running, else today; and the end that many days on.
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
  v_end date;
  v_start date;
begin
  if not public.is_staff() and auth.role() <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_item from public.order_items where id = p_item_id;
  select days into v_days from public.orders where id = v_item.order_id;
  v_end := public.line_plan_end(v_item.phone_number, v_item.iccid, v_item.order_id);
  v_start := case when v_end is not null and v_end >= public.us_today() then v_end + 1 else public.us_today() end;
  return query select v_end, v_start, v_start + greatest(coalesce(v_days, 1) - 1, 0);
end;
$$;

-- The agent sets a refill's dates (after checking the carrier portal, for numbers that were
-- not ours). Only on an open refill or activation the agent holds.
create or replace function public.save_plan_dates(p_item_id uuid, p_starts_on date, p_ends_on date)
returns public.order_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.order_items;
begin
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'the end date must be on or after the start date' using errcode = 'P0001';
  end if;
  update public.order_items i
     set plan_starts_on = p_starts_on, plan_ends_on = p_ends_on
    from public.orders o
   where i.id = p_item_id
     and o.id = i.order_id
     and o.kind in ('refill', 'activation')
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

-- Completing an order now dates every SIM it activates ---------------------------------------
-- eSIM, a SIM card's activation and an activation order: the plan starts today. A refill:
-- the dates the agent saved, else the proposed ones. A replacement carries the end date of
-- the SIM it replaces (the customer keeps the days they paid for).
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

-- Lines delivered before the timer existed get their dates from when they went live.
update public.order_items i
   set plan_starts_on = (i.fulfilled_at at time zone 'America/New_York')::date,
       plan_ends_on = (i.fulfilled_at at time zone 'America/New_York')::date + greatest(o.days - 1, 0)
  from public.orders o
 where o.id = i.order_id
   and o.product_type = 'esim'
   and o.days is not null
   and i.fulfilled_at is not null
   and i.status in ('fulfilled', 'replaced')
   and i.plan_ends_on is null;

update public.order_items i
   set plan_starts_on = (o.fulfilled_at at time zone 'America/New_York')::date,
       plan_ends_on = (o.fulfilled_at at time zone 'America/New_York')::date + greatest(o.days - 1, 0)
  from public.orders o
 where o.id = i.order_id
   and o.product_type = 'physical'
   and o.phase = 'activate'
   and o.status = 'fulfilled'
   and o.days is not null
   and o.fulfilled_at is not null
   and i.status in ('fulfilled', 'replaced')
   and i.plan_ends_on is null;

-- Dealer refills -------------------------------------------------------------------------------
-- p_lines: [{ "day_package_id": uuid, "intl_calling": bool, "numbers": [{ "phone": text, "iccid": text }] }]
-- One order of kind 'refill' per line, one SIM per number, held on the wallet like a batch.
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
        public.match_line(v_number ->> 'phone', v_number ->> 'iccid')
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

-- Notices name refills and activations ------------------------------------------------------------

create or replace function public.order_line_text(o public.orders)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when o.days is null then o.quantity || ' x ' || o.carrier_name || ' SIM card'
    else o.quantity || ' x ' || o.carrier_name || ' ' || o.plan_name || ', ' || o.days || (case when o.days = 1 then ' day' else ' days' end)
         || case o.kind when 'refill' then ', refill' when 'activation' then ', activate SIM' else '' end
  end;
$$;

create or replace function public.notifications_on_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := 'MS-' || new.number;
begin
  if new.status = 'queued' and (tg_op = 'INSERT' or old.status is distinct from 'queued') and new.batch_id is null then
    perform public.notify_staff(
      case when new.phase = 'activate' or new.kind = 'activation' then 'order_activate' when new.replacement_of is not null then 'order_replacement' else 'order_new' end,
      case when new.phase = 'activate' then 'Ready to activate ' || v_label
           when new.kind = 'activation' then 'Activate SIM ' || v_label
           when new.kind = 'refill' then 'Refill ' || v_label
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

  if tg_op = 'UPDATE' and new.dealer_id is not null and new.replacement_of is null and old.status is distinct from new.status then
    if new.status = 'shipped' or (new.status = 'fulfilled' and new.kind = 'card_only') then
      perform public.notify_user(new.dealer_id, 'line_shipped', 'SIM cards posted: ' || v_label, public.order_line_text(new), '/dealer/orders/' || new.batch_id);
    elsif new.status = 'fulfilled' then
      perform public.notify_user(new.dealer_id, 'line_delivered',
        case when new.kind = 'refill' then 'Refilled: ' else 'Delivered: ' end || v_label,
        public.order_line_text(new), '/dealer/orders/' || new.batch_id);
    end if;
  end if;
  return new;
end;
$$;

-- Plan ends of any number: server code only (staff read it through refill_proposed_dates).
revoke all on function public.line_plan_end(text, text, uuid) from public, anon, authenticated;
grant execute on function public.line_plan_end(text, text, uuid) to service_role;
revoke all on function public.match_line(text, text) from public, anon, authenticated;
grant execute on function public.match_line(text, text) to service_role;
revoke all on function public.refill_proposed_dates(uuid) from public, anon;
revoke all on function public.save_plan_dates(uuid, date, date) from public, anon;
revoke all on function public.place_dealer_refill(jsonb, text) from public, anon;

-- Every open SIM of a refill with its proposed dates, in one call (dealer refills can hold
-- hundreds of numbers).
create or replace function public.refill_dates_for_order(p_order_id uuid)
returns table (item_id uuid, current_ends_on date, starts_on date, ends_on date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer;
begin
  if not public.is_staff() and auth.role() <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select days into v_days from public.orders where id = p_order_id;
  return query
  with ends as (
    select i.id, public.line_plan_end(i.phone_number, i.iccid, p_order_id) as current_end
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

revoke all on function public.refill_dates_for_order(uuid) from public, anon;

-- A dealer refill is announced as a refill, counted in numbers.
create or replace function public.notifications_on_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sims integer;
  v_lines integer;
  v_refill boolean;
  v_company text;
begin
  select coalesce(sum(quantity), 0), count(*), coalesce(bool_and(kind = 'refill'), false)
    into v_sims, v_lines, v_refill
    from public.orders where batch_id = new.id;
  select company into v_company from public.dealers where profile_id = new.dealer_id;
  perform public.notify_staff(
    'batch_new',
    case when v_refill
      then 'Dealer refill B-' || new.number || ': ' || v_sims || (case when v_sims = 1 then ' number' else ' numbers' end)
      else 'Dealer order B-' || new.number || ': ' || v_sims || (case when v_sims = 1 then ' SIM' else ' SIMs' end)
    end,
    coalesce(v_company, 'A dealer') || ', ' || v_lines || (case when v_lines = 1 then ' line' else ' lines' end),
    '/agent');
  return new;
end;
$$;

-- A refill or a card's activation posts nothing, so it needs no delivery address even for
-- a SIM card number.
alter table public.orders drop constraint orders_check;
alter table public.orders add constraint orders_check
  check (product_type <> 'physical' or shipping_address is not null or replacement_of is not null or kind in ('refill', 'activation'));
