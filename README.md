# MultiSims USA

US SIM card and eSIM storefront with admin, agent and dealer portals. Next.js 16 (App Router, Cache Components), Supabase, shadcn/ui + Tailwind v4.

- Scope: `docs/MultiSims_USA_Developer_Brief.docx`
- Plan and milestone status: `docs/IMPLEMENTATION_PLAN.md`
- Product truth: `PRODUCT.md`. Design system: `DESIGN.md`. Agent rules: `CLAUDE.md`

## Local setup

Requires Bun, Docker and the Supabase CLI.

```bash
bun install
supabase start                       # local Postgres, Auth, Storage; applies migrations + seed
cp .env.example .env.local           # then fill the Supabase values from:
supabase status -o env               # API_URL, ANON_KEY, SERVICE_ROLE_KEY
bun run admin:create you@example.com 'a-long-password' "Your Name"
bun run dev                          # http://localhost:3000
```

Portal login is at `/portal/login`. `bun run db:reset` rebuilds the database from migrations and seed (recreate the admin afterwards).

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` / `build` / `start` | Next.js |
| `bun run typecheck` / `lint` / `format` | Checks |
| `bun run admin:create` | Create or promote the admin login |
| `bun run db:reset` | Reset local database |

Seed data is placeholder only: prices are deliberately fake ($1 per day plus a step). Replace `supabase/seed.sql` when the client's real catalogue arrives.

## Client Supabase project (first-time setup)

Paste `supabase/manual/setup_client_project.sql` into Dashboard > SQL Editor and run it once. It creates the schema, RLS, the `carrier-logos` bucket and the placeholder catalogue in one transaction, and records the migration so `supabase db push` stays in sync. The admin-login steps are at the bottom of the file.

Then run each later file in `supabase/manual/` in date order (currently `20261003_rate_limits_and_plan_lookup.sql`: the shared rate limiter and the plan 404 check).
