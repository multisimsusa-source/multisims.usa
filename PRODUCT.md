# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Travellers to the US** (primary, public site). Mostly on a phone, often abroad, buying one or two US SIMs or eSIMs before or during a trip. No account. They want to pick a carrier and duration, see the price, pay and get their line fast.
- **Dealers / wholesalers** (dealer portal, Milestone 3). Buy 100 to 200 lines at a time at wholesale prices, some resell through their own websites (for example Global Starlink, Australia). Logins are created by admin; no self sign-up.
- **Agents** (agent portal, Milestone 2). 3 to 4 staff across morning and night shifts who fill orders by hand from carrier portals and paste results back.
- **Owner / admin** (Zafir). Sets carriers, plans, day packages, prices and add-ons; oversees orders, agents and dealers.

## Product Purpose

MultiSims USA sells US carrier SIM cards and eSIMs to travellers and dealers, replacing the client's slow, messy portal (pos.mvno-wireless.com) with a fast public storefront plus admin, agent and dealer portals in one codebase. Success: a traveller on a phone can find and buy a US line in a few taps, and the owner can change carriers, plans and prices himself and see it live instantly.

## Positioning

A US-only SIM and eSIM shop run by a seller with about 15 years in the trade, selling lines from named US carriers and MVNOs (T-Mobile, Verizon, AT&T, Lycamobile and others), with both eSIM and physical SIM, duration-based day packages and an international calling add-on.

## Operating Context

- No carrier APIs yet. Every order is filled manually by an agent; the customer must never be able to tell. Customer-facing statuses are only "Processing", "Delivered" and "Shipped".
- eSIMs are delivered as a QR code image. Physical SIMs are posted by USPS from the US and carry a tracking number.
- Payment is crypto only in version one (USDT TRC-20 and Bitcoin, provider not chosen yet).
- Carriers change often; admin must add, rename, remove and reorder them and change logos at any time.

## Capabilities and Constraints

- Milestone 1: public site (home, plans, plan page, about, contact, FAQ), admin catalogue (carriers, plans, day packages, add-ons), SEO foundation. Buy button leads to a placeholder until checkout in Milestone 2.
- Each plan has: carrier, product type (esim or physical), talk, text, data allowance, hotspot, speed and slowdown after a data limit, countries covered, description, published flag.
- Day package lengths are free to choose per plan, each with its own price.
- Only add-on in scope: international calling, toggled at checkout, admin-priced, stored as a table.
- English only, SEO aimed at the US first, reachable worldwide.
- Not in version one: carrier APIs, card or bank payments, customer accounts, other languages, marketing emails, ticket chat, rich text editing.
- Undecided: real carrier list, plan details, day package lengths, and all prices (client sending later; seed with placeholders).

## Brand Commitments

- Name: MultiSims USA. Domain: multisimsusa.com.
- Logo: final. The typeset MSU lockup in `components/site/wordmark.tsx` (plum monogram, copper MULTISIMS.USA). Show any change to it to the team before applying it.
- Brand colours: ours to choose, to match the logo once it arrives.
- Client's favourite design reference: slowboat.com.au/esim (match its modern, clean level; leave out destinations, experiences, blog and hot picks). Copy the "Trusted network partners" carrier logo strip idea from Global Starlink. Copy TravSim's duration selector and international calling toggle mechanics, not its look.
- Speed and a clean, modern UI matter to the client more than anything.

## Evidence on Hand

- No real reviews exist. Never seed or invent reviews; the reviews section stays hidden until real, client-featured ones exist, and no average rating is shown from hand-picked reviews.
- No real prices yet. Placeholder prices must be obviously dummy.
- Carrier logos: official logos bundled for the six seeded carriers (T-Mobile, Verizon, AT&T, Lycamobile, Mint Mobile, Ultra Mobile); the admin can replace any of them by uploading. The client should confirm he may show each carrier's logo as a reseller.
- No customer counts, delivery-time stats or other metrics are confirmed; do not state any.

## Product Principles

1. Fast first: public pages are static or ISR and load instantly on a phone.
2. The owner edits everything: carriers, plans, durations and prices are data, never code.
3. Invisible manual fulfilment: wording and states never reveal a person in the loop.
4. Honest commerce: no fake reviews, ratings, scarcity or invented numbers.
5. Built for the next phase: fulfilment mode per carrier and a payment provider interface, so carrier APIs and card payments slot in without rewrites.

## Accessibility & Inclusion

WCAG AA contrast, 44px touch targets, full mobile layout. Many buyers are non-native English speakers abroad: plain, short wording over marketing language.
