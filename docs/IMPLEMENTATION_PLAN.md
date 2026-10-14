# MultiSims USA - Implementation Plan (Version One)

Derived from `MultiSims_USA_Developer_Brief.docx` (2 Oct 2026). Three milestones, each ending in a client demo run against its checklist. Run the checklist yourself before reporting a milestone ready.

| Milestone | Scope | Target |
|---|---|---|
| M1 | Public website, plan system, admin catalogue, SEO foundation | ~9 Oct 2026 |
| M2 | Checkout (payment deferred), orders, agent portal, alerts, customer order page, tickets and replacements | ~21 Oct 2026 |
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
| settings * | singleton: owner_email, unclaimed_alert_minutes (5), shipping_fee_cents (0), replacement_needs_approval (false), max_replacements_per_order (2) |
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

## Milestone 2: Selling and filling orders

Target ~21 Oct 2026. Email: **Resend**, domain `multisimsusa.com` verified (9 Oct 2026). Senders: `orders@multisimsusa.com` (orders, alerts, tickets), `hello@multisimsusa.com` (contact form).

**Payments: NOWPayments (built 13 Oct 2026).** Checkout saves the order as `awaiting_payment`, emails the buyer their order page link, and redirects to a NOWPayments hosted invoice (`POST /v1/invoice`, fixed rate, USD price; the buyer picks BTC or USDT TRC-20 on their page). The IPN webhook (`/api/payments/nowpayments`) checks `x-nowpayments-sig` (HMAC-SHA512 of the key-sorted body), then re-reads `GET /v1/payment/{id}` and records that answer: `payment_events` keeps every event, a payment never moves backwards, and only `finished` calls `mark_order_paid`, which puts the order in the agent queue and sends the confirmation and new-order emails once. Edge cases:
- **Confirming:** the order page says payment received, confirming.
- **Expired or failed:** the order page offers a new invoice; an unpaid one is reused for 15 minutes.
- **Underpaid:** the order stays out of the queue and the owner is emailed; Mark as paid on the admin order accepts it.
- **Overpaid:** the order is queued, the payment is tagged Overpaid and the owner is emailed.
- **Paid after cancelling:** recorded, and the owner is emailed.

Admin order page shows every payment. Provider code: `lib/payments/` (`provider.ts` interface, `nowpayments.ts`, `index.ts` flows). With `NOWPAYMENTS_API_KEY` / `NOWPAYMENTS_IPN_SECRET` unset, checkout takes no payment and queues orders directly (development only). **Production must have both set before checkout is public.**

### As built

1. **Database** (`supabase/migrations/20261010000001_orders.sql`): `orders` (number `MS-10001`+, 48-hex private token, price snapshot, claim, attention, staff note, cancel/refund, replacement links), `order_items` (one per SIM: phone, ICCID, QR path, tracking), `payments`, `payment_events`, `order_messages`, `ticket_types` (seeded), `tickets` (#501+), `order_alerts` (one-time emails), view `customer_contacts`. Every state change is a SECURITY DEFINER function that checks role and state in one statement: `mark_order_paid`, `claim_order` (atomic), `release_order`, `reassign_order`, `flag_order`, `save_order_item`, `complete_order`, `cancel_order`, `record_refund`, `answer_ticket`, `issue_replacement`, `approve_replacement`, `take_unclaimed_alerts`. RLS: staff read, writes only through those functions, public nothing. Private buckets `esim-qr` (2 MB) and `ticket-screenshots` (5 MB), signed URLs only. Realtime on `orders` and `tickets`.
2. **Checkout** (`app/(site)/checkout`): quantity 1 to 10, international calling per SIM, name, email, phone/WhatsApp, US ZIP (required), area code (optional), US delivery address for SIM cards, shipping fee from settings. Prices re-read from the database. Rate limited, honeypot. Redirects to the private order page.
3. **Customer order page** (`/order/<token>`, noindex, no-referrer): Processing / Delivered / Shipped only; refreshes itself every 15 s while processing; contact button appears after the alert window; QR codes (1 h signed URLs), phone, ICCID, install steps; USPS tracking link; replacements shown with the old QR marked "No longer valid"; ticket form (type, which SIM, severity, 50+ chars, screenshot checked by magic bytes, Turnstile, rate limit) and each ticket's status and answer.
4. **Agent portal** (`/agent`, agents and owner): queue (Yours, Waiting, Needs the owner, With other agents, Replacements awaiting approval), live via Realtime with chime ("Enable sound" switch, remembered per browser), toast and system notification, Live/Offline indicator. Fulfilment screen: QR by drop, pick or paste, phone, ICCID, one tracking number per parcel, flag "Needs attention", release, mark complete (blocked until every SIM has its QR or tracking). Orders search, tickets queue and ticket page.
5. **Admin additions**: Orders (filters by status, product, agent, search), order page with reassign/assign, send back with instruction, approve replacement, cancel, record refund; Tickets; Activations (search phone, ICCID, tracking, order, email); Customers + CSV export (formula-injection safe); Agents (create login, welcome email, switch off with auth ban and queue release, reset password); Settings (owner alert email, alert minutes, shipping fee, replacement approval, replacements per order, issue types).
6. **Email** (`lib/emails.ts`, `lib/notify.ts`): confirmation, delivered (QR inline), shipped, replacement delivered, ticket answered (customer); new order, customer message, new ticket (owner + every active agent, one email each); agent welcome. One-time guards plus Resend idempotency keys.
7. **Unclaimed alert** (`supabase/migrations/20261010000002_unclaimed_alert_cron.sql`, `supabase/functions/unclaimed-alert`): pg_cron every minute checks in SQL and calls the Edge Function only when an order is overdue; it emails the owner once per order.

### Verified (10 Oct 2026, local Supabase, Playwright, 33/33)
- [x] eSIM order (qty 2) to delivery: two agents claim at once, exactly one wins; complete blocked until both QRs; customer sees both QR codes via signed URLs.
- [x] Ticket from the order page, owner answers and issues a replacement, agent fills it, customer sees the new QR and the old one marked replaced.
- [x] SIM card order with address, tracking number, customer sees Shipped with USPS link.
- [x] Needs attention, owner sends back with "deliver nearest area code", agent sees it.
- [x] Contact button hidden before the window, appears after it, message reaches owner and agents.
- [x] All admin pages render; activation search by ICCID; CSV export works for admin and is refused to the public; unknown token shows not-found.
- [x] No horizontal scroll at 375 px (order page, agent queue). `tsc`, `eslint`, `next build` clean; impeccable detector: no findings.
- [x] SQL: claim race, holder-only completion, one open replacement per SIM, anonymous sees no orders.
- [ ] Unclaimed alert end to end on the client project (needs the deploy steps below).
- [ ] Real emails to real inboxes (local runs log instead of sending).

### To deploy on the client project
1. `supabase db push --linked` (applies the M2 migrations; the project is linked).
2. Vault secrets (SQL editor): `select vault.create_secret('https://fucecskubggngxqgdzyo.supabase.co', 'project_url');` and `select vault.create_secret('<random 32+ chars>', 'cron_secret');`
3. `supabase secrets set CRON_SECRET=<same> RESEND_API_KEY=<key> ORDERS_FROM_EMAIL="MultiSims USA <orders@multisimsusa.com>" SITE_URL=https://multisimsusa.com` then `supabase functions deploy unclaimed-alert`.
4. In admin Settings, set the owner alert email. Create agent logins under Agents.
5. NOWPayments (client account, custody off, payout wallets for BTC and USDT TRC-20, only those coins enabled): set `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET` in Vercel and redeploy. The webhook URL is sent with each invoice; nothing to set in their dashboard. Test with one small real payment of each coin (their sandbox is unmaintained).

### Client decisions (answered 11 Oct 2026, all configurable)
| Question | Client's answer | Built |
|---|---|---|
| Shipping on SIM cards | Not free | Flat fee per order in Settings; $1.00 test placeholder until Zafir sets it |
| Who adds tracking | Owner or agents | Agents and owner |
| Area code unavailable | Deliver the nearest | Agents deliver the nearest area code without flagging; shown on the order screen, checkout field and FAQ |
| Owner approves replacements | No, straight to agents | Setting, default off; owner-issued replacements never wait |
| Replacement limit | 2 per order | `settings.max_replacements_per_order` (default 2), enforced in `issue_replacement` (cancelled ones do not count); used/limit shown on ticket and order (migration `20261011000001`) |
| Support form issue types | Keep the six proposed | Seeded; editable in Settings |
| Area code required? | Optional at checkout (flag to Saad) |
| Payments | NOWPayments built; live once its two env vars are set |

### Agreed changes, 14 Oct 2026 (call with Zafir; scope beyond the brief marked new)
Deadlines: Milestone 2 on 16 or 17 Oct 2026, Milestone 3 about a week later.

| Change | Built |
|---|---|
| **(new)** SIM card priced separately, per physical SIM | `settings.sim_card_price_cents` (default $5), stored per order |
| **(new)** Network fee, once per order (our own line, not NOWPayments' "fee paid by user") | `settings.network_fee_cents` (default $3), stored per order |
| Shipping | Flat per physical order, `shipping_fee_cents` set to $1.00 as a test placeholder until Zafir sets it |
| **(new)** Minimum order | `settings.min_order_cents` (default $15). Checkout blocks below `max(setting, NOWPayments live minimum)`, rounded up to whole dollars. Live minimum = higher of USDT TRC-20 and BTC same-coin pairs at fixed rate (`GET /v1/min-amount`), cached 5 minutes, falls back to the setting. Blocked in the browser and again on the server before any order or invoice exists |
| Price breakdown | `lib/pricing.ts`: plan, international calling, SIM cards, shipping, network fee, total. Same lines at checkout, on the order page and in the confirmation email |
| **(new)** Physical SIM plan start and activation | Checkout asks "When I receive my SIM" (default) or "On a date". Agent posts the card (ICCID and tracking required), the order becomes `shipped` (phase `activate`). On receipt: the customer presses "My SIM has arrived, activate it" once; the order re-enters the queue and the owner and agents get the new-order alert. On a date: pg_cron (`queue_due_activations`, every 10 min) queues it on the day; it shows under Scheduled activations until then and is highlighted on the day. Agent adds the phone number and marks it active; the customer sees Delivered and gets the number by email |
| Customer statuses | Unpaid orders show Processing (the page asks for payment). Physical: Processing, Shipped, Delivered |
| Expired invoices | pg_cron `expire_stale_payments` (every 10 min) marks invoices unpaid after an hour as expired; NOWPayments sends no webhook for this |
| **(new)** Terms and Refund Policy | `/terms` and `/refund-policy`, text in `lib/legal.ts` (draft for Zafir's review), linked from the footer and under the checkout Pay button |
| Housekeeping | `package-lock.json` removed (Bun only) |
| Milestone 3 additions **(new)** | Dealer wholesale and bulk SIM card prices; retail sale prices and discount codes (never on shipping or the network fee, minimum check after discounts). Not built in M2 |

Migrations: `20261014000001_order_shipped_status.sql`, `20261014000002_pricing_activation_expiry.sql`.

## Milestone 3: Dealers, reviews, launch (outline)

1. **Dealer portal**: admin-created logins, wholesale prices + per-dealer overrides, mixed bulk orders, multi-file QR upload for agents, order and activation history, tickets.
2. **Wallet**: `wallet_ledger` only (balance derived), manual Add Funds, crypto top-up via the same provider, reserve on order, capture per fulfilled item, release on cancel, credit limit default 0.
3. **Reviews**: post-delivery rating; admin features; featured shown labelled, no computed average.
4. **Dashboard and reports**: sales, activations, waiting orders, agent and dealer activity; filters by date, carrier, dealer, agent.
5. **Launch**: QA every role on desktop and phone, client Vercel, GoDaddy DNS, Resend domain, Search Console + Bing with sitemap, short admin guide. Recharge Requests waits for Saad's answer.
