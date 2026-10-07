@AGENTS.md

# MultiSims USA project rules

Source of truth for scope: `docs/MultiSims_USA_Developer_Brief.docx`. Build plan and milestone status: `docs/IMPLEMENTATION_PLAN.md`. Product truth: `PRODUCT.md`. If something is not in the brief, it is not in version one; flag it instead of building it.

## UI and UX work: required skills

Any task that creates or changes UI or UX (pages, components, layouts, styling, on-screen copy, forms, states, flows) must load and follow these three skills first, via the Skill tool:

1. `/minimalist-ui` - the visual language: flat surfaces, 1px hairline borders, crisp radii, no heavy shadows or gradients, restrained colour.
2. `/ui-ux-pro-max` - accessibility, touch targets, responsive behaviour, shadcn and Next.js stack guidelines (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --stack shadcn`).
3. `/impeccable` - design direction, craft floor, and audit/polish passes. Run its detector on changed UI before calling the work done (`node ~/.claude/skills/impeccable/scripts/detect.mjs --json <files>`).

Where the skills disagree, resolve in this order: the brief and PRODUCT.md (including the client's logo and its colours), then accessibility (WCAG AA, 44px touch targets), then `/minimalist-ui` for visual language, then the others.

## Design decisions already made (do not reopen)

- Styling: shadcn/ui (base-luma style, Base UI primitives) + Tailwind v4. Customise shadcn components; never ship them in default state.
- Icons: Phosphor (`@phosphor-icons/react`) only. No Lucide in new code.
- Theme: light and dark, following the system setting. All colours are CSS tokens in `app/globals.css`.
- Brand: the client's "MSU / MULTISIMS.USA" logo. Colours come from it: deep plum (primary, `--brand`) and copper (secondary, `--copper`, small details only). Neutrals are a faint cool lavender-grey to match the logo background. The logo is final: the typeset lockup in `components/site/wordmark.tsx`.
- No emojis, no em-dashes in UI copy, no fake reviews or invented stats. Dummy prices must look obviously dummy.
- Customer-facing order wording is only "Processing", "Delivered" and "Shipped". Nothing may suggest a person fills orders.
- Mobile first: most buyers arrive on a phone. Check 375px before desktop.

## Engineering rules

- Next.js 16 App Router with Cache Components (`cacheComponents: true`). Public catalogue reads use `'use cache'` + `cacheTag('catalog')`; admin mutations call `updateTag('catalog')` so changes show on the public site at once.
- `proxy.ts` (not middleware) only does optimistic auth redirects; real authorisation happens in server code and Postgres RLS.
- Supabase: local stack via `supabase start` for development; schema changes are SQL migrations in `supabase/migrations/`. RLS on every table.
- Secrets only in env vars (`.env.local`, never committed). Never create infrastructure under personal accounts; everything belongs to the client.
- Payments sit behind a provider interface; carriers carry a `fulfilment_mode` (manual now, api later).
