-- A correction could take more than the dealer had: the check used "available", which
-- includes the credit limit, so a $1,050 take from a $1,015 balance with $100 credit left the
-- balance at -$35. A take is now limited to the money in the wallet that is not held.

create or replace function public.wallet_owner_entry(
  p_dealer_id uuid,
  p_kind public.ledger_kind,
  p_amount_cents integer,
  p_note text
)
returns public.wallet_ledger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.wallet_ledger;
  v_available bigint;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('manual_add', 'adjustment_credit', 'adjustment_debit') then
    raise exception 'not an owner entry' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 10000000 then
    raise exception 'enter an amount above zero' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'a note is required' using errcode = 'P0001';
  end if;

  perform 1 from public.dealers where profile_id = p_dealer_id for update;
  if not found then
    raise exception 'dealer not found' using errcode = 'P0002';
  end if;

  if p_kind = 'adjustment_debit' then
    -- Only money the dealer has (not held for orders); the credit limit is room to spend, not
    -- money to take back.
    select available_cents - credit_limit_cents into v_available from public.dealer_wallet(p_dealer_id);
    v_available := greatest(v_available, 0);
    if p_amount_cents > v_available then
      raise exception 'only % is available to take', v_available using errcode = 'P0001';
    end if;
  end if;

  insert into public.wallet_ledger (dealer_id, kind, amount_cents, created_by, note)
  values (p_dealer_id, p_kind, p_amount_cents, auth.uid(), left(trim(p_note), 500))
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.wallet_owner_entry(uuid, public.ledger_kind, integer, text) from public, anon;
