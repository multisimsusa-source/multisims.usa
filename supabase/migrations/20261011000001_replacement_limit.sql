-- Client decisions, 11 Oct 2026.
-- At most two replacements per order (cancelled ones do not count). The owner can change
-- the limit in Settings; it applies to everyone, the owner included.

alter table public.settings
  add column max_replacements_per_order integer not null default 2
    check (max_replacements_per_order between 0 and 20);

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

  -- Lock the original order so two staff cannot both take the last replacement.
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
    shipping_cents, total_cents, paid_at, replacement_of, replaces_item_id, ticket_id
  ) values (
    v_src.channel,
    case when coalesce(v_hold, false) then 'awaiting_approval'::public.order_status else 'queued'::public.order_status end,
    'not_required', v_src.customer_name, v_src.customer_email, v_src.customer_phone, v_src.zip_code,
    v_src.area_code, v_src.shipping_address, v_src.carrier_id, v_src.plan_id, v_src.day_package_id,
    v_src.addon_id, v_src.carrier_name, v_src.plan_name, v_src.product_type, v_src.days, v_src.addon_name,
    1, 0, 0, 0, 0, now(), v_root, p_item_id, p_ticket_id
  ) returning * into v_new;

  insert into public.order_items (order_id, seq) values (v_new.id, 1);

  if p_ticket_id is not null then
    update public.tickets set status = 'in_progress' where id = p_ticket_id and status = 'open';
  end if;
  return v_new;
end;
$$;

revoke all on function public.issue_replacement(uuid, uuid) from public, anon;
