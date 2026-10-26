-- MultiSims USA - reviews for every order and every SIM, from customers and dealers.
--
-- A review is either of a whole order (order_item_id null, one per order) or of one SIM
-- (one per SIM). order_id is always the order the rated thing belongs to: for a replacement
-- SIM, the replacement order. Customers and dealers may change their review; a changed
-- review leaves the website until the owner features it again. Only website reviews are
-- ever featured; dealer reviews stay in admin.

alter table public.reviews
  add column order_item_id uuid references public.order_items (id) on delete cascade,
  add column updated_at timestamptz;

alter table public.reviews drop constraint reviews_order_id_key;
create unique index reviews_order_once on public.reviews (order_id) where order_item_id is null;
create unique index reviews_item_once on public.reviews (order_item_id) where order_item_id is not null;

-- Dealers read the reviews of their own orders; writes go through server code.
create policy "reviews: dealer reads own" on public.reviews
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = reviews.order_id and o.dealer_id = auth.uid())
  );
