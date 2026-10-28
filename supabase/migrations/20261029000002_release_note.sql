-- The owner's cancel reason is internal ("Reason (internal)" on the cancel dialog), but the
-- dealer's wallet history showed it in the hold-returned entry. The entry now only names the
-- order, and entries already written lose the reason.

create or replace function public.wallet_release_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left bigint;
begin
  if new.dealer_id is null then
    return new;
  end if;

  select coalesce(sum(amount_cents) filter (where kind = 'reserve'), 0)
       - coalesce(sum(amount_cents) filter (where kind in ('capture', 'release')), 0)
    into v_left
    from public.wallet_ledger
   where order_id = new.id;

  if v_left > 0 then
    insert into public.wallet_ledger (dealer_id, kind, amount_cents, order_id, batch_id, created_by, note)
    values (new.dealer_id, 'release', v_left, new.id, new.batch_id, auth.uid(), 'MS-' || new.number || ' cancelled')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.wallet_release_order() from public, anon, authenticated;

update public.wallet_ledger
   set note = substring(note from '^(MS-[0-9]+ cancelled)')
 where kind = 'release' and note ~ '^MS-[0-9]+ cancelled: ';
