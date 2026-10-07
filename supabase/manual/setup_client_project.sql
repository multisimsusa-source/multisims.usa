-- =====================================================================================
-- MultiSims USA: one-shot setup for the client's Supabase project (Milestone 1).
--
-- Run once in Supabase Dashboard > SQL Editor > New query (paste everything, Run).
-- Contains: schema + RLS + storage bucket (migration 20261002000001_catalog)
--           + placeholder catalogue seed (fake prices, replace when real data arrives)
--           + a migration-history record so `supabase db push` will not re-apply it.
-- Runs in a single transaction: if anything fails, nothing is applied.
-- Generated from supabase/migrations/ and supabase/seed.sql; edit those, not this file.
-- =====================================================================================

begin;

-- ---------- Migration 20261002000001_catalog ----------------------------------------
-- MultiSims USA - Milestone 1: profiles, catalogue (carriers, plans, day packages, add-ons), settings.
-- RLS is on for every table. The public has no direct table access; public pages read
-- through server-only code. Admins read and write through their own session.

create extension if not exists citext;

-- Enums ---------------------------------------------------------------------

create type public.user_role as enum ('admin', 'agent', 'dealer');
create type public.product_type as enum ('esim', 'physical');
create type public.fulfilment_mode as enum ('manual', 'api');

-- Helpers -------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text not null default '',
  email citext not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role check used by RLS policies. SECURITY DEFINER so it can read profiles
-- without recursing through the profiles policies.
create or replace function public.current_role_is(target public.user_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = target and p.active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_role_is('admin');
$$;

-- Carriers ------------------------------------------------------------------

create table public.carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_path text,
  display_order integer not null default 0,
  fulfilment_mode public.fulfilment_mode not null default 'manual',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index carriers_display_order_idx on public.carriers (display_order, name);

create trigger carriers_updated_at before update on public.carriers
  for each row execute function public.set_updated_at();

-- Plans ---------------------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references public.carriers (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  product_type public.product_type not null,
  -- Plan details. Free text where carriers phrase things differently.
  talk text not null default 'Unlimited US talk',
  sms text not null default 'Unlimited US text',
  data_gb numeric(7, 2) check (data_gb is null or data_gb >= 0),          -- null = unlimited
  hotspot_gb numeric(7, 2) check (hotspot_gb is null or hotspot_gb >= 0), -- null = not included
  network text not null default '5G / 4G LTE',
  slowdown_after_gb numeric(7, 2) check (slowdown_after_gb is null or slowdown_after_gb >= 0),
  slowdown_speed text,
  countries_covered text[] not null default array['United States'],
  summary text not null default '' check (length(summary) <= 200),
  description text not null default '',
  published boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plans_carrier_idx on public.plans (carrier_id, display_order);
create index plans_published_idx on public.plans (published, product_type);

create trigger plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- Day packages --------------------------------------------------------------

create table public.day_packages (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  days integer not null check (days between 1 and 365),
  price_cents integer not null check (price_cents >= 0),
  wholesale_price_cents integer check (wholesale_price_cents is null or wholesale_price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, days)
);

create trigger day_packages_updated_at before update on public.day_packages
  for each row execute function public.set_updated_at();

-- Add-ons -------------------------------------------------------------------
-- Stored as a table, though only international calling is in scope.

create table public.addons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null check (length(trim(name)) between 1 and 80),
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  wholesale_price_cents integer check (wholesale_price_cents is null or wholesale_price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger addons_updated_at before update on public.addons
  for each row execute function public.set_updated_at();

-- Settings (singleton) ------------------------------------------------------

create table public.settings (
  id boolean primary key default true check (id),
  owner_email citext,
  unclaimed_alert_minutes integer not null default 5 check (unclaimed_alert_minutes between 1 and 120),
  shipping_fee_cents integer not null default 0 check (shipping_fee_cents >= 0),
  replacement_needs_approval boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

insert into public.settings (id) values (true);

-- Row level security ---------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.carriers enable row level security;
alter table public.plans enable row level security;
alter table public.day_packages enable row level security;
alter table public.addons enable row level security;
alter table public.settings enable row level security;

-- Profiles: everyone signed in reads their own row; admins read and manage all.
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: admin all" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Catalogue and settings: admin only. Agents and dealers get read access in later milestones.
create policy "carriers: admin all" on public.carriers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "plans: admin all" on public.plans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "day_packages: admin all" on public.day_packages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "addons: admin all" on public.addons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "settings: admin all" on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Storage: carrier logos are public images, writable by admins only ------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'carrier-logos', 'carrier-logos', true, 1048576,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "carrier-logos: admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'carrier-logos' and public.is_admin());
create policy "carrier-logos: admin update" on storage.objects
  for update to authenticated using (bucket_id = 'carrier-logos' and public.is_admin());
create policy "carrier-logos: admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'carrier-logos' and public.is_admin());

-- ---------- Placeholder seed --------------------------------------------------------
-- PLACEHOLDER CATALOGUE. Replace (do not edit around) when the client's real carrier list,
-- plan details and prices arrive.
--
-- Prices are deliberately fake: exactly $1 per day plus a whole-dollar step per plan,
-- so nobody mistakes them for real ones. International calling is a flat $5.
-- Day package lengths use the TravSim set until the client picks his own.
-- Never seed reviews.

insert into public.carriers (name, slug, display_order) values
  ('T-Mobile',     't-mobile',     10),
  ('Verizon',      'verizon',      20),
  ('AT&T',         'att',          30),
  ('Lycamobile',   'lycamobile',   40),
  ('Mint Mobile',  'mint-mobile',  50),
  ('Ultra Mobile', 'ultra-mobile', 60);

with c as (select id, slug from public.carriers)
insert into public.plans (
  carrier_id, name, slug, product_type, talk, sms, data_gb, hotspot_gb, network,
  slowdown_after_gb, slowdown_speed, countries_covered, summary, description, published, display_order
)
select c.id, p.name, p.slug, p.product_type::public.product_type, p.talk, p.sms, p.data_gb, p.hotspot_gb,
       p.network, p.slowdown_after_gb, p.slowdown_speed, p.countries, p.summary, p.description, true, p.ord
from c
join (values
  ('t-mobile', 'Unlimited Plus', 't-mobile-unlimited-plus-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', null::numeric, 10::numeric, '5G / 4G LTE', 50::numeric, '1.5 Mbps',
   array['United States', 'Mexico', 'Canada'],
   'Unlimited data on T-Mobile 5G with 10 GB hotspot.',
   'A full unlimited line on the T-Mobile network. Talk and text across the US without limits, priority 5G data for the first 50 GB, then unlimited data at reduced speed. Includes 10 GB of mobile hotspot so you can share with a laptop or tablet. Works in Mexico and Canada too.',
   10),
  ('t-mobile', 'Essentials 20 GB', 't-mobile-essentials-20gb-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', 20, 5, '5G / 4G LTE', 20, '256 kbps',
   array['United States'],
   '20 GB of high-speed T-Mobile data for lighter use.',
   'A lighter T-Mobile line for maps, messaging and social. 20 GB of high-speed 5G and 4G LTE data, then reduced speed for the rest of your package. Unlimited talk and text inside the US and 5 GB of hotspot.',
   20),
  ('t-mobile', 'Unlimited Plus SIM', 't-mobile-unlimited-plus-sim', 'physical',
   'Unlimited US talk', 'Unlimited US text', null, 10, '5G / 4G LTE', 50, '1.5 Mbps',
   array['United States', 'Mexico', 'Canada'],
   'The Unlimited Plus line as a physical SIM, posted to you.',
   'The same unlimited T-Mobile line as our eSIM, on a physical tri-cut SIM card for phones without eSIM support. Posted from the US by USPS with a tracking number.',
   30),

  ('verizon', 'Unlimited Welcome', 'verizon-unlimited-welcome-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', null, 5, '5G / 4G LTE', 30, '3 Mbps',
   array['United States'],
   'Unlimited data on the Verizon network.',
   'A full unlimited line on the Verizon network. Unlimited talk and text, priority data for the first 30 GB, then unlimited at reduced speed. Includes 5 GB of hotspot.',
   10),
  ('verizon', 'Prepaid 15 GB', 'verizon-prepaid-15gb-sim', 'physical',
   'Unlimited US talk', 'Unlimited US text', 15, null, '4G LTE', 15, '128 kbps',
   array['United States'],
   '15 GB on Verizon 4G LTE on a physical SIM.',
   'A simple Verizon line with 15 GB of 4G LTE data for travellers who mostly need maps, messages and email. Unlimited talk and text inside the US. Posted from the US by USPS with a tracking number.',
   20),

  ('att', 'Unlimited Starter', 'att-unlimited-starter-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', null, 10, '5G / 4G LTE', 50, '1.5 Mbps',
   array['United States', 'Mexico', 'Canada'],
   'Unlimited AT&T data with 10 GB hotspot.',
   'A full unlimited line on AT&T. Unlimited talk and text across the US, priority 5G data for the first 50 GB, then unlimited data at reduced speed. Includes 10 GB of hotspot and use in Mexico and Canada.',
   10),
  ('att', 'Prepaid 25 GB', 'att-prepaid-25gb-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', 25, 5, '5G / 4G LTE', 25, '256 kbps',
   array['United States'],
   '25 GB of AT&T high-speed data.',
   '25 GB of high-speed AT&T data with unlimited talk and text inside the US. After 25 GB, data continues at reduced speed until your package ends. Includes 5 GB of hotspot.',
   20),
  ('att', 'Unlimited Starter SIM', 'att-unlimited-starter-sim', 'physical',
   'Unlimited US talk', 'Unlimited US text', null, 10, '5G / 4G LTE', 50, '1.5 Mbps',
   array['United States', 'Mexico', 'Canada'],
   'The Unlimited Starter line as a physical SIM.',
   'The same unlimited AT&T line as our eSIM, on a physical tri-cut SIM card. Posted from the US by USPS with a tracking number.',
   30),

  ('lycamobile', 'Unlimited Talk 10 GB', 'lycamobile-10gb-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', 10, null, '5G / 4G LTE', 10, '128 kbps',
   array['United States'],
   'Budget Lycamobile line with 10 GB of data.',
   'An affordable line on the Lycamobile network, which runs on T-Mobile towers. 10 GB of high-speed data with unlimited talk and text inside the US.',
   10),
  ('lycamobile', 'Unlimited Talk 10 GB SIM', 'lycamobile-10gb-sim', 'physical',
   'Unlimited US talk', 'Unlimited US text', 10, null, '5G / 4G LTE', 10, '128 kbps',
   array['United States'],
   'The 10 GB Lycamobile line on a physical SIM.',
   'The same 10 GB Lycamobile line on a physical tri-cut SIM card. Posted from the US by USPS with a tracking number.',
   20),

  ('mint-mobile', 'Unlimited', 'mint-mobile-unlimited-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', null, 5, '5G / 4G LTE', 40, '1 Mbps',
   array['United States'],
   'Unlimited Mint Mobile data on T-Mobile towers.',
   'Mint Mobile runs on the T-Mobile 5G network. Unlimited talk and text, priority data for the first 40 GB, then unlimited at reduced speed. Includes 5 GB of hotspot.',
   10),
  ('mint-mobile', '5 GB Starter', 'mint-mobile-5gb-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', 5, 5, '5G / 4G LTE', 5, '128 kbps',
   array['United States'],
   'A small Mint Mobile line for short trips.',
   'Enough data for maps and messages on a short stay. 5 GB of high-speed data on the T-Mobile 5G network with unlimited talk and text inside the US.',
   20),

  ('ultra-mobile', 'Unlimited International', 'ultra-mobile-unlimited-international-esim', 'esim',
   'Unlimited US talk', 'Unlimited US text', null, 5, '5G / 4G LTE', 30, '1 Mbps',
   array['United States'],
   'Unlimited data with calling home included on Ultra Mobile.',
   'Ultra Mobile is built for people who call abroad. Unlimited talk and text inside the US, priority data for the first 30 GB, then unlimited at reduced speed. Runs on the T-Mobile network.',
   10),
  ('ultra-mobile', 'Unlimited International SIM', 'ultra-mobile-unlimited-international-sim', 'physical',
   'Unlimited US talk', 'Unlimited US text', null, 5, '5G / 4G LTE', 30, '1 Mbps',
   array['United States'],
   'The Ultra Mobile unlimited line on a physical SIM.',
   'The same Ultra Mobile line on a physical tri-cut SIM card. Posted from the US by USPS with a tracking number.',
   20)
) as p(carrier_slug, name, slug, product_type, talk, sms, data_gb, hotspot_gb, network,
       slowdown_after_gb, slowdown_speed, countries, summary, description, ord)
  on p.carrier_slug = c.slug;

-- Dummy prices: $1 per day + a whole-dollar step that differs per plan.
insert into public.day_packages (plan_id, days, price_cents, wholesale_price_cents)
select p.id, d.days,
       (d.days + (row_number() over (partition by d.days order by p.slug))::int - 1) * 100,
       null
from public.plans p
cross join (values (1), (7), (10), (14), (21), (30), (60)) as d(days);

insert into public.addons (code, name, description, price_cents) values
  ('intl_calling', 'International calling',
   'Call numbers outside the US from your US line.', 500);

-- ---------- Record the migration for the Supabase CLI -------------------------------
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations (version, name)
values ('20261002000001', 'catalog')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- AFTER RUNNING: make the admin login
--   1. Dashboard > Authentication > Users > Add user > Create new user
--      (enter the owner's email and a strong password, tick "Auto Confirm User").
--   2. Run this, with that email:
--
--   insert into public.profiles (id, role, email, full_name, active)
--   select id, 'admin', email, 'Zafir', true from auth.users
--   where email = 'owner@example.com'
--   on conflict (id) do update set role = 'admin', active = true;
--
-- Alternatively from this repo: bun run admin:create <email> '<password>' "Zafir"
-- =====================================================================================
