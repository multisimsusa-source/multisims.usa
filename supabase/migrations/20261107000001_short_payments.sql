-- Short crypto payments (6 Nov: a dealer sent 50 USDT for a $50 top-up whose payment page asked
-- 59.56 USDT, network fee included). The payment partner still pays out what arrived, less its
-- fees. We now keep that figure, and a short dealer top-up is credited with it automatically.
--
-- received_cents is the US dollar value that reached the owner's wallet (the partner's outcome
-- amount, valued at the payment's own rate), or null when it cannot be worked out.

alter table public.payments
  add column outcome_amount numeric(30, 12),
  add column outcome_currency text,
  add column received_cents integer check (received_cents is null or received_cents >= 0);

comment on column public.payments.received_cents is
  'US cents that reached the owner''s wallet after the payment partner''s fees. Null when unknown.';

-- A top-up may now be credited in two steps: what arrived short, then the rest if the dealer
-- completes the payment later. The payment row lock below keeps the total at or under the
-- top-up amount, so the one-row-per-payment index goes.
drop index if exists public.wallet_ledger_topup_once;
create index wallet_ledger_payment_idx on public.wallet_ledger (payment_id) where payment_id is not null;

drop function if exists public.credit_wallet_topup(uuid);

-- Brings a top-up's credit up to p_target_cents (the full top-up when null), never above the
-- top-up amount, and never twice: returns the new ledger row, or null when nothing was owed.
create or replace function public.credit_wallet_topup(p_payment_id uuid, p_target_cents integer default null, p_note text default null)
returns public.wallet_ledger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_credited integer;
  v_target integer;
  v_row public.wallet_ledger;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null or v_payment.kind <> 'wallet_topup' then
    raise exception 'not a top-up' using errcode = 'P0002';
  end if;

  select coalesce(sum(amount_cents), 0) into v_credited
  from public.wallet_ledger where payment_id = v_payment.id and kind = 'topup';

  v_target := least(coalesce(p_target_cents, v_payment.price_cents), v_payment.price_cents);
  if v_target - v_credited <= 0 then
    return null;
  end if;

  insert into public.wallet_ledger (dealer_id, kind, amount_cents, payment_id, created_by, note)
  values (v_payment.dealer_id, 'topup', v_target - v_credited, v_payment.id, auth.uid(),
          coalesce(nullif(trim(p_note), ''), 'Crypto top-up' || coalesce(' (' || upper(v_payment.pay_currency) || ')', '')))
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.credit_wallet_topup(uuid, integer, text) from public, anon;

-- A short website order the owner cancels still holds the customer's money, so a refund can be
-- recorded on it too: a paid order, or a cancelled one with a short payment on it.
create or replace function public.record_refund(p_order_id uuid, p_note text)
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

  update public.orders o
     set refunded_at = now(), refund_note = nullif(trim(p_note), ''), refunded_by = auth.uid()
   where o.id = p_order_id and o.refunded_at is null
     and (o.paid_at is not null
          or (o.status = 'cancelled'
              and exists (select 1 from public.payments p where p.order_id = o.id and p.status = 'partially_paid')))
  returning * into v_order;

  if v_order.id is null then
    raise exception 'order is unpaid or already refunded' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;
revoke all on function public.record_refund(uuid, text) from public, anon;
