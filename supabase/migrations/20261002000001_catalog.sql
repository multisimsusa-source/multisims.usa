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
