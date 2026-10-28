-- Releasing a claimed order sent every agent "New order" again (four times after two
-- claim-and-release rounds). Only real arrivals are announced now.

create or replace function public.notifications_on_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := 'MS-' || new.number;
begin
  -- An agent releasing an order puts it back without news; the owner sending a flagged order
  -- back says so, not "New order".
  if tg_op = 'UPDATE' and new.status = 'queued' and old.status = 'claimed' then
    null;
  elsif tg_op = 'UPDATE' and new.status = 'queued' and old.status in ('needs_attention', 'awaiting_approval') then
    perform public.notify_staff('order_new', 'Back in the queue ' || v_label, public.order_line_text(new), '/agent/orders/' || new.id);
  elsif new.status = 'queued' and (tg_op = 'INSERT' or old.status is distinct from 'queued') and new.batch_id is null then
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
