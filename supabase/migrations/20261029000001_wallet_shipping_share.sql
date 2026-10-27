-- A dealer's SIM is taken from the wallet at its own price. The batch's one shipping charge
-- sits in the total of its first physical line; it used to be spread over that line's SIMs
-- ($161.00 for 40 cards at $4.00 read as $4.02 each and one $4.22). It is now taken with
-- the line's first SIM instead. Totals, holds and releases are unchanged: shares still add
-- up to the order total exactly.

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
begin
  select * into v_order from public.orders where id = new.order_id;
  if v_order.dealer_id is null or v_order.replacement_of is not null or v_order.total_cents = 0 then
    return new;
  end if;

  v_shipping := least(greatest(coalesce(v_order.shipping_cents, 0), 0), v_order.total_cents);
  v_amount := public.item_share_cents(v_order.total_cents - v_shipping, v_order.quantity, new.seq)
            + case when new.seq = 1 then v_shipping else 0 end;
  if v_amount > 0 then
    insert into public.wallet_ledger (dealer_id, kind, amount_cents, order_id, order_item_id, batch_id, created_by, note)
    values (v_order.dealer_id, 'capture', v_amount, v_order.id, new.id, v_order.batch_id, auth.uid(),
            'MS-' || v_order.number || ', SIM ' || new.seq
            || case when new.seq = 1 and v_shipping > 0 then ', with shipping' else '' end)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.wallet_capture_item() from public, anon, authenticated;
