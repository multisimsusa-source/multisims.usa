-- 7 Nov: carriers often send an eSIM's QR code after the line is live, so the QR no longer
-- holds up delivery. The agent completes the order without it and adds it later
-- (add_item_qr); the customer or dealer is emailed the QR when it arrives. The plan dates
-- still start at delivery, which is when the carrier starts the line.

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

-- A QR code for an eSIM already delivered. Any staff member may add a missing one; only the
-- owner may replace one that is there. Refills and activations have no QR.
create or replace function public.add_item_qr(p_item_id uuid, p_qr_path text)
returns public.order_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.order_items;
  v_order public.orders;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_qr_path, ''))) = 0 then
    raise exception 'choose a QR code image' using errcode = 'P0001';
  end if;

  select * into v_item from public.order_items where id = p_item_id for update;
  select * into v_order from public.orders where id = v_item.order_id;
  if v_item.id is null or v_order.product_type <> 'esim' or v_order.kind in ('refill', 'activation')
     or v_item.status <> 'fulfilled' or v_order.status = 'cancelled' then
    raise exception 'this SIM is not a delivered eSIM' using errcode = 'P0001';
  end if;
  if v_item.qr_path is not null and not public.is_admin() then
    raise exception 'this SIM already has a QR code' using errcode = 'P0001';
  end if;

  update public.order_items set qr_path = trim(p_qr_path) where id = p_item_id
  returning * into v_item;
  return v_item;
end;
$$;

revoke all on function public.add_item_qr(uuid, text) from public, anon;
