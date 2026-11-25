-- The dealer read policy on ticket_files compared t.id with an unqualified ticket_id, which
-- inside the subquery resolved to orders.ticket_id, so a dealer could never read the files
-- on their own tickets through RLS. (The portal reads them with the service role, so nothing
-- showed wrong.) Qualify the column.

drop policy "ticket_files: dealer read own" on public.ticket_files;
create policy "ticket_files: dealer read own" on public.ticket_files
  for select to authenticated using (
    exists (
      select 1
        from public.tickets t
        join public.orders o on o.id = t.order_id
       where t.id = ticket_files.ticket_id and o.dealer_id = auth.uid()
    )
  );
