@AGENTS.md

# MultiSims USA project rules

Source of truth for scope: `docs/MultiSims_USA_Developer_Brief.docx`. Build plan and milestone status: `docs/IMPLEMENTATION_PLAN.md`. Product truth: `PRODUCT.md`. If something is not in the brief, it is not in version one; flag it instead of building it.

## UI and UX work: the design system is binding

`DESIGN.md` is the design system for every screen (public site, checkout, order page, admin, agent and dealer portals). Any task that creates or changes UI or UX (pages, components, layouts, styling, on-screen copy, forms, states, flows) must:

1. Read `DESIGN.md` and open `/admin/design` (live reference of every token and shared component) before writing code.
2. Build only from its tokens (`app/globals.css`), primitives (`components/ui/`) and patterns (`components/patterns/`: Tag, Notice, FormCard/FormSection, DetailList, Panel/KeyValue, EmptyState, ActionBar, CopyButton). If something is missing, add it to the system (token, pattern or primitive variant) and to `/admin/design` and `DESIGN.md` in the same change; never hand-roll it on one screen.
3. Never set control heights by hand (density comes from `--control-h`), never use literal or palette colours, heavy shadows, gradients, Lucide, native selects, dashes or emoji. `bun run lint` runs `scripts/check-design.mjs` and fails on these.
4. Finish with the review checklist in `DESIGN.md` section 9.

Also load and follow these three skills first, via the Skill tool:

1. `/minimalist-ui` - the visual language: flat surfaces, 1px hairline borders, crisp radii, no heavy shadows or gradients, restrained colour.
2. `/ui-ux-pro-max` - accessibility, touch targets, responsive behaviour, shadcn and Next.js stack guidelines (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --stack shadcn`).
3. `/impeccable` - design direction, craft floor, and audit/polish passes. Run its detector on changed UI before calling the work done (`node ~/.claude/skills/impeccable/scripts/detect.mjs --json <files>`).

Where guidance disagrees, resolve in this order: the brief and PRODUCT.md (including the client's logo and its colours), then accessibility (WCAG AA, 44px touch targets), then `DESIGN.md`, then `/minimalist-ui` for visual language, then the others.

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
