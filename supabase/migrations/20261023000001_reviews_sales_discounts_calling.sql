-- MultiSims USA - Milestone 3: reviews, sale prices, discount codes, calling destinations.

-- Reviews ------------------------------------------------------------------------------------
-- After delivery the customer rates the order (stars, optional comment). The owner ticks the
-- ones to feature; featured ones show on the website labelled as featured customer reviews.
-- No average is ever computed from them. Written only by server code keyed by the order's
-- private token; nobody reads them directly except the owner.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (length(comment) <= 500),
  -- First name as the customer gave it at checkout, shown when featured.
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  featured boolean not null default false,
  featured_at timestamptz,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  check (not (featured and hidden))
);

create index reviews_featured_idx on public.reviews (featured_at desc) where featured;
create index reviews_created_idx on public.reviews (created_at desc);

alter table public.reviews enable row level security;
create policy "reviews: admin all" on public.reviews
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Sale prices ----------------------------------------------------------------------------------
-- A day package can be on sale: the sale price is charged and the regular price is shown
-- struck through. Null = not on sale. Dealers never see sale prices.

alter table public.day_packages
  add column sale_price_cents integer check (sale_price_cents is null or sale_price_cents >= 0),
  add constraint day_packages_sale_below_price check (sale_price_cents is null or sale_price_cents < price_cents);

-- Discount codes ---------------------------------------------------------------------------------
-- Website orders only. A code takes a percent or a fixed amount off the plan, calling and SIM
-- card lines, never shipping or the network fee. A use is counted when the payment is
-- confirmed, so abandoned checkouts never use up a code.

create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique check (code ~ '^[A-Za-z0-9_-]{3,30}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  -- percent: 1 to 90; fixed: cents
  value integer not null check (value > 0),
  carrier_id uuid references public.carriers (id) on delete cascade,
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  active boolean not null default true,
  note text not null default '' check (length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 90),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create trigger discount_codes_updated_at before update on public.discount_codes
  for each row execute function public.set_updated_at();

alter table public.discount_codes enable row level security;
create policy "discount_codes: admin all" on public.discount_codes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.orders
  add column discount_code_id uuid references public.discount_codes (id) on delete set null,
  add column discount_code text,
  add column discount_cents integer not null default 0 check (discount_cents >= 0);

-- Payment confirmed: as before, plus the discount code's use is counted the first time the
-- order leaves awaiting_payment.
create or replace function public.mark_order_paid(p_order_id uuid, p_payment_status public.payment_status default 'paid')
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_was text;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select status::text into v_was from public.orders where id = p_order_id for update;

  update public.orders
     set payment_status = p_payment_status,
         paid_at = coalesce(paid_at, now()),
         status = case when status = 'awaiting_payment' then 'queued'::public.order_status else status end
   where id = p_order_id
     and status in ('awaiting_payment', 'queued', 'claimed', 'needs_attention', 'fulfilled')
  returning * into v_order;

  if v_order.id is null then
    raise exception 'order not payable' using errcode = 'P0002';
  end if;

  if v_was = 'awaiting_payment' and v_order.discount_code_id is not null then
    update public.discount_codes set uses = uses + 1 where id = v_order.discount_code_id;
  end if;
  return v_order;
end;
$$;

revoke all on function public.mark_order_paid(uuid, public.payment_status) from public, anon;

-- International calling destinations -------------------------------------------------------------
-- Where the international calling add-on reaches and how many minutes each destination
-- allows (null = unlimited). Imported from the carrier's rate table; the owner can edit it.

create table public.addon_destinations (
  id uuid primary key default gen_random_uuid(),
  addon_id uuid not null references public.addons (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  minutes_cap integer check (minutes_cap is null or minutes_cap >= 0),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (addon_id, name)
);

create index addon_destinations_addon_idx on public.addon_destinations (addon_id, display_order, name);

alter table public.addon_destinations enable row level security;
create policy "addon_destinations: admin all" on public.addon_destinations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
