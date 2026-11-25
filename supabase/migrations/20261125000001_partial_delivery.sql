-- 25 Nov: a bulk line no longer waits for its last SIM. The agent delivers the SIMs that are
-- ready (deliver_ready_items); the rest stay on the same order in the queue. Each delivered
-- SIM is taken from the dealer's wallet as before (per-SIM capture trigger). When the rest
-- cannot be filled, the owner cancels just those (cancel_remaining_items): their share of the
-- hold goes back to the wallet and the order finishes with the SIMs that were delivered.
--
-- A SIM card's line is activated in a second step, while the item is already 'fulfilled'
-- (shipped). activated_at records that step per SIM, so part of a shipment can go live first.

alter table public.order_items add column if not exists activated_at timestamptz;

update public.order_items i
   set activated_at = coalesce(o.fulfilled_at, i.fulfilled_at)
  from public.orders o
 where o.id = i.order_id
   and o.product_type = 'physical'
   and o.phase = 'activate'
   and o.status = 'fulfilled'
   and i.status in ('fulfilled', 'replaced');

-- Shipping is taken with the first SIM taken from the order, not with SIM 1: SIM 1 may be one
-- of the SIMs cancelled when the rest of a line cannot be filled.
create or replace function public.wallet_capture_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_shipping integer;
  v_amount integer;
  v_first boolean;
begin
  select * into v_order from public.orders where id = new.order_id;
  if v_order.dealer_id is null or v_order.replacement_of is not null or v_order.total_cents = 0 then
    return new;
  end if;

  v_shipping := least(greatest(coalesce(v_order.shipping_cents, 0), 0), v_order.total_cents);
  v_first := v_shipping > 0 and not exists (
    select 1 from public.wallet_ledger where order_id = v_order.id and kind = 'capture'
  );
  v_amount := public.item_share_cents(v_order.total_cents - v_shipping, v_order.quantity, new.seq)
            + case when v_first then v_shipping else 0 end;
  if v_amount > 0 then
    insert into public.wallet_ledger (dealer_id, kind, amount_cents, order_id, order_item_id, batch_id, created_by, note)
    values (v_order.dealer_id, 'capture', v_amount, v_order.id, new.id, v_order.batch_id, auth.uid(),
            'MS-' || v_order.number || ', SIM ' || new.seq || case when v_first then ', with shipping' else '' end)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.wallet_capture_item() from public, anon, authenticated;

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

-- A delivered SIM card's line is not edited again once it is live.
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
     and (i.status = 'pending' or (o.phase = 'activate' and i.status = 'fulfilled' and i.activated_at is null))
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

-- What "ready" means for one SIM of the order, at the order's current step.
--   eSIM: a QR code or a phone number saved (the QR may still follow).
--   Activating a card the buyer has: its phone number and ICCID.
--   Posting a SIM card: its ICCID and tracking number.
--   A posted SIM card's line: its phone number.
-- Refills are all done in one step, and a replacement is one SIM, so neither is split.
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

  if v_order.product_type = 'physical' and v_order.phase = 'activate' and v_order.kind <> 'activation' then
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

  if v_order.product_type = 'physical' and v_order.phase = 'activate' and v_order.kind <> 'activation' then
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

revoke all on function public.deliver_ready_items(uuid) from public, anon;
grant execute on function public.deliver_ready_items(uuid) to authenticated;

-- The owner gives up on the SIMs of a line that cannot be filled. The SIMs already delivered
-- stay; on a dealer order the cancelled ones' share of the hold goes back to the wallet (a
-- website customer is refunded by the owner, outside the platform); the order moves on as if
-- it had been completed with the SIMs it has.
create or replace function public.cancel_remaining_items(p_order_id uuid, p_reason text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_done integer;
  v_cancelled integer;
  v_left bigint;
  v_due boolean;
  v_today date := public.us_today();
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.status not in ('queued', 'claimed', 'needs_attention') then
    raise exception 'this order is not open' using errcode = 'P0001';
  end if;
  if v_order.product_type = 'physical' and v_order.phase = 'activate' and v_order.kind <> 'activation' then
    raise exception 'these SIM cards are already posted' using errcode = 'P0001';
  end if;

  select count(*) filter (where status = 'fulfilled') into v_done
    from public.order_items where order_id = p_order_id;
  if v_done = 0 then
    raise exception 'no SIM is delivered yet: cancel the whole order instead' using errcode = 'P0001';
  end if;

  update public.order_items set status = 'cancelled' where order_id = p_order_id and status = 'pending';
  get diagnostics v_cancelled = row_count;
  if v_cancelled = 0 then
    raise exception 'nothing is left to cancel' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount_cents) filter (where kind = 'reserve'), 0)
       - coalesce(sum(amount_cents) filter (where kind in ('capture', 'release')), 0)
    into v_left
    from public.wallet_ledger
   where order_id = p_order_id;
  if v_left > 0 and v_order.dealer_id is not null then
    insert into public.wallet_ledger (dealer_id, kind, amount_cents, order_id, batch_id, created_by, note)
    values (v_order.dealer_id, 'release', v_left, v_order.id, v_order.batch_id, auth.uid(),
            'MS-' || v_order.number || ': ' || v_cancelled || ' SIM' || case when v_cancelled = 1 then '' else 's' end || ' cancelled')
    on conflict do nothing;
  end if;

  if v_order.product_type = 'physical' and v_order.kind = 'line' then
    v_due := v_order.plan_start = 'on_date' and v_order.activate_on <= v_today;
    update public.orders
       set phase = 'activate',
           shipped_at = now(),
           status = case when v_due then 'queued'::public.order_status else 'shipped'::public.order_status end,
           activation_requested_at = case when v_due then now() else null end,
           claimed_by = null, claimed_at = null, attention_reason = null, staff_note = null,
           cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
     where id = p_order_id
    returning * into v_order;
  elsif v_order.kind = 'card_only' then
    update public.orders
       set status = 'fulfilled', shipped_at = now(), fulfilled_at = now(), attention_reason = null,
           cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
     where id = p_order_id
    returning * into v_order;
  else
    update public.orders
       set status = 'fulfilled', fulfilled_at = now(), attention_reason = null,
           cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
     where id = p_order_id
    returning * into v_order;
  end if;
  return v_order;
end;
$$;

revoke all on function public.cancel_remaining_items(uuid, text) from public, anon;
grant execute on function public.cancel_remaining_items(uuid, text) to authenticated;

-- Cancelling a whole order would mark SIMs already delivered as cancelled: the owner cancels
-- only the rest instead. A posted SIM card line (activation step) is unchanged.
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

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is not null and v_order.phase = 'fulfil' and v_order.status not in ('fulfilled', 'cancelled')
     and exists (select 1 from public.order_items where order_id = p_order_id and status = 'fulfilled') then
    raise exception 'some SIMs are delivered: cancel the rest instead' using errcode = 'P0001';
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
revoke all on function public.cancel_order(uuid, text) from public, anon;
