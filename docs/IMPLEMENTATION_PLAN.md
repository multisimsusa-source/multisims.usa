# MultiSims USA - Implementation Plan (Version One)

Derived from `MultiSims_USA_Developer_Brief.docx` (2 Oct 2026). Three milestones, each ending in a client demo run against its checklist. Run the checklist yourself before reporting a milestone ready.

| Milestone | Scope | Target |
|---|---|---|
| M1 | Public website, plan system, admin catalogue, SEO foundation | ~9 Oct 2026 |
| M2 | Crypto checkout, orders, agent portal, alerts, customer order page, tickets and replacements | ~21 Oct 2026 |
| M3 | Dealer portal and wallet, reviews, dashboard and reports, launch | 28 Oct 2026 |

## Architecture

- **App**: Next.js 16 App Router, TypeScript, Cache Components on. One codebase, four sides split by route group:
  - `app/(site)/*` public website (static shell, cached catalogue reads)
  - `app/portal/login` shared login for admin, agents, dealers
  - `app/admin/*` admin portal (role `admin`)
  - `app/agent/*` agent portal (M2, role `agent`)
  - `app/dealer/*` dealer portal (M3, role `dealer`)
- **Data**: Supabase Postgres + Auth + Storage (+ Realtime in M2). Migrations in `supabase/migrations/`, local stack via `supabase start`, pushed to the client's project with `supabase db push` once linked.
- **Freshness**: public reads are `'use cache'` functions tagged `catalog`; every admin mutation is a Server Action that calls `updateTag('catalog')`, so the public site updates on the next request with no rebuild.
- **Security**: RLS on every table. The public has no table access; public pages read through server-only code. Admin writes go through the signed-in user's session so RLS (`is_admin()`) enforces the role a second time. `proxy.ts` only does optimistic redirects.
- **UI**: shadcn/ui (base-luma, Base UI) + Tailwind v4, Phosphor icons, Geist / Funnel Display / Geist Mono, light and dark tokens. Design rules in `CLAUDE.md`.
- **Next-phase seams**: `carriers.fulfilment_mode` (`manual` | `api`) stored now; payments behind a `PaymentProvider` interface in M2.

## Data model (M1 tables marked *)

| Table | Key columns |
|---|---|
| profiles * | id (auth user), role (admin, agent, dealer), full_name, email, active |
| carriers * | name, slug, logo_path, display_order, fulfilment_mode, active |
| plans * | carrier_id, name, slug, product_type (esim, physical), talk, sms, data_gb (null = unlimited), hotspot_gb, network, slowdown_after_gb, slowdown_speed, countries_covered[], summary, description, published, display_order |
| day_packages * | plan_id, days, price_cents, wholesale_price_cents, active (unique plan + days) |
| addons * | code, name, description, price_cents, wholesale_price_cents, active (only `intl_calling` in scope) |
| settings * | singleton: owner_email, unclaimed_alert_minutes (5), shipping_fee_cents (0), replacement_needs_approval (false) |
| dealer_prices | M3 |
| orders, order_items, payments | M2 |
| tickets, ticket_types | M2 |
| wallet_ledger | M3 |
| reviews | M3 |

Storage buckets: `carrier-logos` (public, M1), `esim-qr` (private, signed URLs, M2), `ticket-screenshots` (private, M2).

---

## Milestone 1: Website and plan system

### Step 1. Foundation
1. Install deps: `@supabase/supabase-js`, `@supabase/ssr`, `@phosphor-icons/react`, `zod`, `server-only`.
2. Enable `cacheComponents` in `next.config.ts`; allow Supabase storage host in `images.remotePatterns`.
3. `supabase init`, local stack, `.env.example` + `.env.local`.
4. Design tokens in `app/globals.css` (light + dark), fonts in root layout, shadcn components customised (button, input, label, select, switch, textarea, table, dialog, badge, card, separator, sheet, dropdown, sonner, tabs, accordion).
5. Switch shadcn `iconLibrary` to Phosphor.

### Step 2. Database
1. Migration `0001_catalog.sql`: enums, tables above, `updated_at` triggers, `is_admin()` helper, RLS policies (admin full access, no anon access), `carrier-logos` bucket + storage policies.
2. `supabase/seed.sql`: T-Mobile, Verizon, AT&T, Lycamobile, Mint Mobile, Ultra Mobile; 2-3 plans each with realistic details; day packages 1, 7, 10, 14, 21, 30, 60; international calling add-on; all prices obviously dummy: exactly $1.00 per day plus a whole-dollar plan step (1 day $1, 30 days $30), international calling $5.00. No reviews, ever.
3. `scripts/create-admin.ts`: creates the admin auth user + profile via the service role.

### Step 3. Data layer
1. `lib/supabase/server.ts` (session client via cookies), `lib/supabase/admin.ts` (service role, server-only), `lib/supabase/browser.ts`.
2. `lib/catalog.ts`: cached reads (`getCarriers`, `getPublishedPlans`, `getPlanBySlug`, `getAddons`) tagged `catalog`.
3. `lib/auth.ts`: `getSessionProfile()`, `requireRole('admin')`.
4. `lib/money.ts`, `lib/plan-format.ts` for display formatting.

### Step 4. Public website (`app/(site)`)
1. Layout: sticky nav (wordmark, Plans, About, FAQ, Contact, Portal Login), mobile sheet menu, footer.
2. Home: hero (US SIM / eSIM offer + primary CTA), carrier logo strip ("Trusted network partners", from carriers table), eSIM vs physical SIM as two separate products, featured plans, how it works, FAQ teaser. No destinations, experiences, blog, hot picks, or reviews.
3. Plans listing: filter by product type (eSIM / SIM) and carrier via search params; plan cards with "from" price.
4. Plan page: carrier, product type, details grid (talk, text, data, hotspot, speed + slowdown, countries), description, day package selector, international calling toggle, live price, Buy button to placeholder `/checkout` page (M2 replaces it). Product JSON-LD with offers.
5. About, FAQ (accordion, FAQPage JSON-LD), Contact (form, rate-limited server action; emails via Resend when configured, Turnstile when keys present).
6. Mobile layout checked at 375px first.

### Step 5. Auth and portal shell
1. `/portal/login`: email + password via Supabase Auth, redirect by role.
2. `proxy.ts`: optimistic redirect of `/admin`, `/agent`, `/dealer` to login when no session cookie.
3. Placeholder `/agent` and `/dealer` pages ("coming in this release") behind role checks.

### Step 6. Admin catalogue (`app/admin`)
1. Shell: sidebar (Overview, Carriers, Plans, Add-ons; Settings arrives in M2), mobile-friendly.
2. Carriers: list with order, create, rename, logo upload, display order up/down, fulfilment mode (manual; api visible but disabled), active toggle, remove (blocked while plans exist? no: cascade warns and removes its plans from the site).
3. Plans: list filterable by carrier and type; create/edit form with every detail field, description, publish/withdraw.
4. Day packages inside the plan editor: add any length in days with price (and wholesale price stored for M3), edit, remove.
5. Add-ons: international calling name, description, price, active.
6. Every action revalidates `catalog`; toasts confirm; validation via zod with inline errors.

### Step 7. SEO foundation
1. Unique `metadata` per page, `metadataBase`, canonical URLs.
2. `app/sitemap.ts` (static pages + every published plan), `app/robots.ts` (disallow portals).
3. Open Graph + Twitter tags, generated `opengraph-image`.
4. JSON-LD: Organization (root), Product + Offer/AggregateOffer (plan pages), FAQPage.
5. Static shell for every public page; `next/image` for logos; no heavy client bundles (only the price selector, nav sheet and forms are client components).

### Step 8. Verify (M1 demo checklist, on a phone viewport)
- [x] Admin adds a carrier and a plan, prices its day packages and international calling, publishes it, finds it on the public site.
- [x] Removing a carrier makes it and its plans disappear from the site.
- [x] Changing a price updates the public plan page.
- [x] All of the above at 375px width (automated Playwright run, 2 Oct 2026).
- [x] `bun run build`, `bun run typecheck`, `bun run lint` clean; impeccable detector run over changed UI (no findings).

### M1 status (3 Oct 2026)
Steps 1-8 built and verified. Done since the first pass:
- Client Supabase project set up (`supabase/manual/setup_client_project.sql`), admin login created, admin portal on the shadcn Sidebar with catalogue charts and the profile menu.
- Shared rate limiter in Postgres (`rate_limit_hit`) for the login and contact forms, falling back to memory if the database call fails.
- Withdrawn or unknown plan URLs answer with a real 404 status: `proxy.ts` checks `plan_is_live` before the page streams.
- Crypto provider comparison written (`docs/CRYPTO_PROVIDER_COMPARISON.md`) for Saad before M2.

To run on the client project: `supabase/manual/20261003_rate_limits_and_plan_lookup.sql` (until then both features fall back safely).

Added beyond the brief (flag to Saad): plan search in the site header (icon, Cmd/Ctrl+K or "/"), searching published plans by carrier, name and features.

Open before the demo (need the client or Saad):
- Real carrier logos (admin upload) and the client's carrier list, plan details and prices (replace `supabase/seed.sql`).
- Deployment: handled on our side (client-owned account, never a personal one).
- Admin Settings page moves to M2, where its fields (alert minutes, owner email, shipping fee) are first used.

### Owed for M1 (none block)
| Item | Placeholder |
|---|---|
| Carrier list and plan details | Seed data |
| Day package lengths | TravSim set (1, 7, 10, 14, 21, 30, 60) |
| Prices | Obvious dummy prices |
| Logo | Final: the typeset MSU lockup in the site (`components/site/wordmark.tsx`), plum + copper |
| Crypto provider research | Comparison of NOWPayments, Cryptomus, OxaPay, CoinPayments, Plisio, CoinGate due before M2 (section 9 of brief) |

---

## Milestone 2: Selling and filling orders (outline)

1. **Payments**: `PaymentProvider` interface (`createInvoice`, `verifyWebhook`, `parseEvent`), first implementation for the chosen crypto provider. Webhook route verifies signatures; handles expired, underpaid, overpaid, confirming.
2. **Checkout**: plan + day package + add-on + quantity; name, email, phone, ZIP, area code; address for physical SIMs. Order only enters the agent queue on webhook-confirmed payment. Confirmation email (Resend).
3. **Orders**: `orders`, `order_items` (one per SIM), `payments`. Internal statuses (paid, claimed, fulfilled, needs_attention, cancelled, refunded) mapped to customer statuses (Processing, Delivered, Shipped).
4. **Agent portal**: admin creates agents; Realtime queue; atomic claim (`UPDATE ... WHERE claimed_by IS NULL RETURNING`); fulfilment screen (QR upload to private bucket, phone, ICCID; tracking number for physical); mark complete delivers by email and on order page. Alerts: email to active agents, sound with "Enable sound" switch, Notification API.
5. **Customer order page**: unguessable token link; Processing state; contact button after 5 minutes (emails owner + agents); delivered QR via signed URL or tracking number.
6. **Unclaimed alert**: Supabase pg_cron every minute + Edge Function, threshold from `settings`.
7. **Tickets**: issue types table, severity, 50-char description, screenshot (5 MB, PNG/JPG/GIF/WebP), Turnstile + rate limit; queue in admin and agent portal; one team answer; Issue Replacement creates a linked zero-payment order.
8. **Admin**: all orders with filters, reassign, cancel/refund record, activation history search, customer list CSV export, settings for open-point defaults.

## Milestone 3: Dealers, reviews, launch (outline)

1. **Dealer portal**: admin-created logins, wholesale prices + per-dealer overrides, mixed bulk orders, multi-file QR upload for agents, order and activation history, tickets.
2. **Wallet**: `wallet_ledger` only (balance derived), manual Add Funds, crypto top-up via the same provider, reserve on order, capture per fulfilled item, release on cancel, credit limit default 0.
3. **Reviews**: post-delivery rating; admin features; featured shown labelled, no computed average.
4. **Dashboard and reports**: sales, activations, waiting orders, agent and dealer activity; filters by date, carrier, dealer, agent.
5. **Launch**: QA every role on desktop and phone, client Vercel, GoDaddy DNS, Resend domain, Search Console + Bing with sitemap, short admin guide. Recharge Requests waits for Saad's answer.
