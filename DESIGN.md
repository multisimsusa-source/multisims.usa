# MultiSims USA Design System

The rulebook for every screen in this codebase: public site, checkout and order pages, admin portal, agent portal, and the dealer portal to come. It is binding. New UI is built from the tokens and components below; anything the system does not cover is added to the system first (see "Growing the system"), never improvised on one screen.

- **Live reference:** `/admin/design` renders every token and shared component in the current theme. If this file and that page disagree, the code is right and this file gets fixed.
- **Enforcement:** `bun run lint` runs ESLint and `scripts/check-design.mjs`, which fails on hard-coded colours, palette colours, heavy shadows, gradients, Lucide, native selects, dashes, emoji and hand-set control heights.
- **Precedence when guidance conflicts:** the developer brief and PRODUCT.md (including the client's logo colours), then accessibility (WCAG AA, target sizes), then this file, then the skills (`/minimalist-ui`, `/ui-ux-pro-max`, `/impeccable`).

## How to do any UI task

1. Read this file and open `/admin/design`.
2. Find the closest existing screen and the patterns it uses. Reuse them; match its spacing, wording and behaviour.
3. Build with tokens and shared components only. If you need something new, add it to the system (token, pattern, or primitive variant) and to `/admin/design` in the same change.
4. Check phone (375px) first, then desktop, in light and dark.
5. Run `bun run lint` (includes the design check) and `bun run typecheck`, then the impeccable detector on changed UI: `node ~/.claude/skills/impeccable/scripts/detect.mjs --json <files>`.
6. Go through the review checklist at the end of this file.

---

## 1. Principles

1. **Fast and plain, like a good boarding pass.** A traveller on a phone should find, buy and install a US line in a few taps. Every element earns its place; when in doubt, remove it.
2. **Flat and quiet.** Hairline borders, crisp radii, no shadows on surfaces, no gradients except photo scrims and the one soft hero wash. Plum is the only saturated colour on screen.
3. **One primary action per area.** The plum button is the next step. Everything else is outline, ghost or a link.
4. **State is always visible, in words.** Tags, notices and trackers say what is happening. Colour supports the words, never replaces them.
5. **Invisible manual fulfilment.** Customers only ever see Processing, Delivered, Shipped (and Cancelled). No wording, state or timing may suggest a person fills orders.
6. **Honest.** No fake reviews, invented numbers, false urgency or placeholder text that looks like real data. Dummy prices look dummy.

---

## 2. Foundations

### Colour

All colours are CSS tokens in `app/globals.css`, defined for light and dark and exposed to Tailwind (`bg-brand`, `text-muted-foreground`, ...). Screens never use hex, `oklch()`, `rgb()`, Tailwind palette colours (`text-blue-500`) or `black`. The only literal colours outside `globals.css` are the browser `themeColor` values and generated images (`app/icon.tsx`, `app/opengraph-image.tsx`) and email HTML (`lib/emails.ts`, `supabase/functions/`), which cannot read CSS variables.

| Token | Use | Never |
|---|---|---|
| `background` | Page ground | |
| `canvas` | Banded sections on long pages; portal ground | |
| `card` | Cards, forms, lists, panels on the site | |
| `muted` | Quiet fills: inactive chips, icon tiles, answer blocks | Body text backgrounds for long reading |
| `border` | Every 1px hairline | Thicker than 1px |
| `foreground` / `muted-foreground` | Text / secondary text (AA on every ground) | Grey text below AA |
| `brand` (= `primary`) | Primary buttons, selected states, links, switches, focus | Large backgrounds |
| `brand-soft` + `brand-ink` | eSIM badge, info notices, "Processing" | |
| `copper` | Logo tagline, SIM card mark, large graphics | Actions, small text |
| `copper-ink` | Copper text at body size (step numbers) | |
| `copper-foreground` | Text on a copper fill | |
| `plum` | The logo plum, constant in both themes: text on white buttons over photos | Anything that should follow the theme |
| `scrim` | Under text on photos, via `scrim-left`, `scrim-bottom`, `scrim-band` | |
| `success` / `warning` / `danger` `-soft` + `-ink` | Status: a pale fill with its ink text, always as a pair | Mixing a soft fill with another ink |
| `chart-1` ... `chart-5` | Admin charts only | UI elements |

Dark mode is designed, not inverted: every token has a dark value, plum becomes a light mauve for actions, soft tints become deep tints with light ink. Check both themes for every change.

### Type

Fonts: Funnel Display (`font-heading`) for headings, Geist (`font-sans`) for UI and body, Geist Mono (`font-mono`) for numbers people compare, Bodoni Moda (`font-logo`) for the logo only.

Use the role classes from `globals.css`; do not re-compose sizes, weights and tracking per screen.

| Role | Class | Use |
|---|---|---|
| Page title | `type-page-title` (30px, 36px from `sm`) | One per page, the `h1` |
| Section title | `type-section-title` (20px) | `h2` sections inside a page |
| Card title | `type-card-title` (16px, Geist semibold) | Form sections, cards, dialogs |
| Overline | `type-overline` (12px, uppercase, 0.06em, muted) | Panel labels in side rails |
| Body | `text-base` (16px), line-height 1.6 | Reading text, capped at 65ch |
| Small | `text-sm`, `text-muted-foreground` for help text | UI text, descriptions |
| Data | `font-mono tabular` | Prices, order numbers, ICCIDs, phone numbers, counts |

Marketing pages (home hero, plan page) may go larger with `font-heading` and tracking `-0.02em`; portals never do. Headings are balanced (`text-wrap: balance`), body is `pretty`.

### Spacing and layout

Tailwind's 4px scale. Use `gap` on flex/grid parents, not margins between siblings.

| Rhythm | Value |
|---|---|
| Inside a control group (label to field, field to help) | Field component (8px) |
| Between fields | `gap-y-5` (20px), `gap-x-4` (16px) |
| Card / section padding | `p-5` phone, `sm:p-6` |
| Between cards in a stack | `gap-4` (related) or `gap-6` (separate groups) |
| Between page sections | `mt-10` |
| Page vertical padding | `py-8 sm:py-12` (site), portal `py-6 sm:py-8` |

Containers: site pages use `Container` (`max-w-6xl`, 16px gutter, 24px from `sm`); reading and order pages narrow to `max-w-3xl`; portal content is `max-w-6xl`. Two-column flows put the form left and a summary rail right (`lg:grid-cols-[1fr_24rem]`), the rail sticky (`lg:sticky lg:top-24`) and first on phones when it carries the price.

### Density and control size

Inputs, selects and `lg` buttons read their height from one variable, `--control-h`:

- **44px** by default: public site, login, dialogs, anything a phone user touches.
- **40px** inside the admin and agent portals: the shell sets `density-compact`.

Never set a control's height by hand (the checker fails on `h-*` on `Input`, `SelectTrigger`, `Textarea` or an `lg`/`xl` Button). If a surface needs another density, add a density utility, not a one-off height. Other sizes: default Button 36px for compact inline actions, `sm` 32px, `xl` 48px for the page's single main action.

### Shape and depth

- Controls (buttons, inputs, selects): `rounded-md`.
- Cards, forms, lists, dialogs: `rounded-xl`, 1px `border`, no shadow.
- Inline notices and inner blocks: `rounded-lg`.
- Tags, chips, switches, avatars: fully rounded.
- `.sim-cut` (cut top-right corner): day-package tiles and product marks only.
- `shadow-pop` for popovers, menus and the one floating hero picker. Nothing else casts a shadow.
- Fact grids use `gap-px bg-border` hairlines instead of per-cell borders.
- One level of containment: never a card inside a card. Group inside a card with `divide-y` or `border-t`.

### Icons

Phosphor only: `@phosphor-icons/react`, or `/ssr` in Server Components. Regular weight in UI, bold inside filled buttons and marks, fill for success checks. 16px in text and buttons, 20px in empty states and list leads. Icon-only buttons have an `aria-label` and a 40px+ target. No Lucide, no emoji, no unicode symbols as icons.

### Imagery

Real US places and real phones (Unsplash License, credits in `docs/IMAGE_CREDITS.md`), self-hosted in `public/images/`, served through `next/image`, `rounded-xl`, dimmed to 90% in dark mode. Text on a photo always sits on a scrim utility. QR codes always render on white with padding, whatever the theme. Signed URLs (QR codes, screenshots) use a plain `<img>`, never `next/image`.

### Motion

State-driven and quiet: 150 to 200ms colour transitions, `scale(0.98)` on button press, accordion height, a slow pulse only on "in progress" dots. No entrance choreography, no scroll-triggered reveals in the portals. Everything respects `prefers-reduced-motion` (use `motion-safe:`). The route loader is a 2px brand hairline at the top.

---

## 3. Components

### Primitives (`components/ui/`)

shadcn (base-luma style, Base UI) customised to these tokens. Use them as they are; extend with a variant in the primitive when a screen needs something new, never by overriding styles at the call site.

| Need | Use |
|---|---|
| Action | `Button` (`default`, `outline`, `secondary`, `ghost`, `destructive`, `link`; sizes `sm`, default, `lg`, `xl`, `icon*`) |
| Text field | `Input`, `Textarea` inside `Field` with `FieldLabel`, `FieldDescription`, `FieldError` |
| Choice from a list | `Select` (always; never native `<select>`); pass `items` and `name` |
| On/off | `Switch` with a visible label |
| One of a few, visible | Segmented radio labels (see ticket severity, ticket status) or `RadioGroup` |
| Confirm a consequence | `ConfirmAction` (alert dialog); with a note, `NoteDialog` |
| Form in an overlay | `Dialog` |
| Menu | `DropdownMenu` |
| Feedback after an action | `toast` (sonner) |
| Table | `Table` on desktop, a `divide-y` card list on phones |
| Loading | `Skeleton` shaped like the content (`components/admin/skeletons.tsx`) |

### Patterns (`components/patterns/`)

Every repeated piece of UI lives here. If you are about to write one of these by hand, import it instead.

| Pattern | Component | Use |
|---|---|---|
| Status pill | `Tag` (`tone`: neutral, brand, success, warning, danger) | Order, ticket, item and website states |
| Inline message | `Notice` (`tone`: info, success, warning, danger; `title`, `icon`) | Form errors, confirmations, owner instructions, warnings. Never a coloured side border |
| Long form | `FormCard` + `FormSection` (`cols` 1, 2, 3) | Checkout, settings, any form with more than one group |
| Customer-facing facts | `DetailList` + `DetailRow` | Order details, receipts. One column, no empty cells |
| Side-rail facts | `Panel` + `KeyValue` | Portal rails: Line to get, Customer, Record |
| Nothing to show | `EmptyState` | Lists and searches; different words for filtered-empty |
| Phone action bar | `ActionBar` (`sticky` or `fixed`) | Keeps a flow's finishing action in reach on phones |
| Copy a value | `CopyButton` | Phone numbers, ICCIDs, tracking numbers |

Product and brand composites live in `components/site/` (carrier logo, product badge, plan card, plan configurator, header, footer, wordmark) and portal composites in `components/staff/` and `components/admin/` (portal shell, filters, order workspace, alerts, ticket views, page header).

---

## 4. Patterns for building screens

### Page structure

- **Site page:** back link (if any) above the `h1`, one line of plain explanation under it, then content. Banded sections alternate `background` and `canvas` with hairlines on long pages.
- **Portal page:** `AdminPageHeader` (title, one-line description, primary action on the right), then filters, then content. The header renders at once; only the data streams behind a matching skeleton.
- **Record page (order, ticket):** identifier and status first, the work in the main column, facts in a right rail of `Panel`s.

### Forms

- One `FormCard`, split into `FormSection`s. Fields on a 2 or 3 column grid from `sm`, one column on phones. City, State, ZIP share a 3-column row; full-width fields use `sm:col-span-full`.
- Label above every field. Optional fields say "(optional)" in muted text; required is the default.
- Help text below the field gives the format and an example ("for example 10001"). Never put examples in placeholders, they read as filled answers.
- Errors replace the help text in `danger` ink, name the problem and the fix ("Enter a 5-digit US ZIP code"). A failed submit also shows a `Notice` and scrolls to and focuses the first invalid field.
- Correct `type`, `inputMode` and `autoComplete` on every input. Numbers people compare use `font-mono tabular`.
- Buttons say what happens ("Place order", "Send request", "Save settings") and show progress while pending ("Placing order...").
- Save only lights up after a change in edit forms; destructive actions sit apart and confirm first.

### Lists and tables

- Portal lists: one bordered container with `divide-y` rows; each row is one click target (stretched link) with its actions above the link layer. Plum is reserved for the row's primary action (Claim); others are outline.
- Desktop data tables become card lists on phones.
- Filters live in the URL (`UrlFilters`): search debounced, selects apply on choice, Back undoes them, changing a filter resets the page.
- Counts read "17 orders" or "8 of 12 plans" when filtered. Dates read "Oct 10, 8:09 PM" in the current year.

### Status and feedback

- State uses `Tag`; customer-facing order state is only Processing, Delivered, Shipped, Cancelled.
- Progress the customer waits on uses the three-step tracker (Placed, Processing, Delivered/Shipped).
- After an action: a toast saying what happened ("Saved", "Claimed. It is yours."). For errors, the toast says what failed and what to do.
- Irreversible actions confirm in a dialog that states the consequence ("This cannot be undone.").
- Live data (agent queue) shows a Live/Offline indicator and refreshes lists only, never a screen someone is typing in.

### Empty, loading and error states

Every list has an `EmptyState`, every async region a shaped `Skeleton`, every form an error path, and unknown records the not-found page. Do not ship a screen without these.

### Phones

Design at 375px first. Primary flows keep their finishing action in reach with `ActionBar`. Targets are at least 44px on public pages and 40px in the portals. No horizontal scroll; long values (emails, ICCIDs, tracking) wrap with `break-all`. Touch-only hints replace keyboard hints (`pointer-coarse:`).

---

## 5. Content and voice

- Plain, short, specific. Many buyers read English as a second language.
- Name things the way users do ("your order page", "phone number"), never the system's names.
- Controls state the action; errors state the problem and the fix; no apologies, no exclamation marks.
- No em or en dashes, no emoji, no marketing clichés, no invented stats or reviews.
- Customer copy never implies a person is involved in filling orders ("We are preparing your eSIM" is fine, "an agent will send" is not).

## 6. Accessibility floor

WCAG AA contrast in both themes; visible brand focus rings; labels tied to every control; errors announced (`Notice` uses `role="alert"` for danger, `status` otherwise; live regions for totals and counters); 44px targets on public pages, 40px in portals; skip link; one `main` landmark; reduced motion respected; information never by colour alone.

## 7. Rules the checker enforces

`scripts/check-design.mjs` scans `app/` and `components/` (not the vendored `components/ui/`):

| Rule id | Fails on |
|---|---|
| `color-literal` | hex, `oklch()`, `rgb()`, `hsl()` in components and class names |
| `color-palette` | Tailwind palette colours (`bg-blue-500`), `black` |
| `shadow` | `shadow-sm` ... `shadow-2xl`, `shadow-inner` |
| `gradient` | `bg-gradient-*`, `linear-gradient()` and friends (use the scrim utilities) |
| `lucide` | imports from `lucide-react` |
| `native-select` | `<select>` |
| `dash` | em and en dashes |
| `emoji` | any emoji |
| `control-height` | `h-*` on `Input`, `SelectTrigger`, `Textarea`, or an `lg`/`xl` `Button` |

A genuine exception carries `design-allow: <rule id>` and a reason in a comment on the same line or the line above. Exceptions are rare and reviewed.

## 8. Growing the system

- **New colour or size need:** add a token in `globals.css` (both themes), expose it in `@theme inline`, add it to `/admin/design` and this file.
- **Same markup in a second place:** extract it to `components/patterns/` with a short doc comment, replace both uses, add it to `/admin/design` and the table above.
- **New variant of a primitive:** add it to the primitive's `cva` variants, not as call-site classes.
- **New surface (dealer portal):** reuse `PortalShell` with a new nav variant and `density-compact`; its lists, forms and records follow section 4 unchanged.

## 9. Review checklist

Before calling UI work done:

- [ ] Built from tokens and shared components; nothing in section 3 hand-rolled.
- [ ] One primary action per area; secondary actions outline or ghost.
- [ ] Checked at 375px and desktop, light and dark; no horizontal scroll.
- [ ] Loading, empty, error, disabled and success states exist.
- [ ] Copy is plain, has no dashes or emoji, and customer wording never implies manual fulfilment.
- [ ] Focus visible, labels tied, targets 44px (site) or 40px (portal), contrast AA.
- [ ] `bun run lint` (with the design check) and `bun run typecheck` pass; impeccable detector clean.
- [ ] This file and `/admin/design` updated if the system grew.

---

## Appendix: surfaces as built

Notes on how each built screen applies the system. Update when a screen changes.

### World

The client's MSU logo sets the identity: a deep plum Didone monogram over copper tracked capitals, on a faint lavender-grey ground. Photography carries the travel story the flat UI does not: arriving in the US with a phone that already works.

### Public site

- **Home** (Persuade): 1. hero stage (photo with `scrim-left`, live plan picker floating with `shadow-pop`; on phones offer, photo, then picker); 2. partner strip (carrier logos as one-ink silhouettes, colour on hover); 3. "A real US line" bento with photo cells and a brand-soft cell of live package lengths as SIM-cut chips; 4. eSIM and SIM card panels; 5. "Will my phone work?" (iPhone/Android check, `*#06#` in a `<kbd>`); 6. plans (grid from `sm`, swipe row on phones); 7. trip-length photo cards with `scrim-bottom`; 8. checkout-to-signal steps; 9. dealers; 10. FAQ; 11. closing band with `scrim-band`. Copy comes from the catalogue, never invented.
- **Site header:** sticky 64px, translucent with a hairline; wordmark left, nav centred, icons right; current section gets a 2px plum bar. Phones: theme, portal, divider, menu sheet.
- **Plan search:** command dialog (Cmd/Ctrl+K or `/`), whole-word matching over carrier, plan and facts, results with logo, facts and from price.
- **Plans page:** toolbar with count, removable filter tags and three Selects ("Label Value"), choices in the URL, grid dims while streaming.
- **Plan card:** logo and product badge, name, summary, three facts, "From" price in mono, arrow square that fills plum on hover; one stretched link.
- **Plan configurator:** day tiles as hidden radios with `.sim-cut`, international calling switch row, live total in `aria-live`, full-width Buy on phones.
- **Checkout:** back link above the title; `FormCard` with Contact, Your US number, Delivery address (City/State/ZIP in one row) and, for SIM cards, Plan start (segmented radio labels, as on the ticket form, plus a date `Input` when "On a date"); order card right (sticky) and first on phones with logo, facts, quantity stepper, calling switch, itemised lines from `lib/pricing.ts` (plan, calling, SIM cards, shipping, network fee), mono total, `xl` Continue to payment, then the Terms and Refund Policy line and "What happens next"; below the minimum order a warning `Notice` replaces the error slot and the button is disabled; phones hold the total and the button in a sticky `ActionBar`.
- **Customer order page:** order number and status tag above the title; an unpaid order shows Processing with the payment card in place of the tracker; status card with the tracker (three steps for eSIM, four for SIM cards: Placed, Processing, Shipped, Delivered; labels drop to `text-xs` on phones); for posted SIM cards an activation card ("Got your SIM?" with one button, then "Your line is starting up", or the scheduled start date); contact card only after the alert window; `DetailList` carries every price line; SIM cards with QR on white, mono facts and copy buttons, replaced lines last and dimmed; install steps; `DetailList`; help with past tickets and the form behind "Report a problem".
- **Terms and Refund Policy:** `components/site/legal-page.tsx`, `PageHeader` then a single reading column at 68ch, section headings and paragraphs from `lib/legal.ts`, lists with copper markers.
- **Footer:** canvas band, link columns (carriers read live; Help includes Terms and Refund Policy), payment row, large logo-face signature at 7% plum, copyright and Back to top.
- **Carrier logos:** uploaded logo, else bundled official logo, else the name in type; optically balanced heights; mono tone in the partner strip.

### Portals (admin and agent)

- **Shell** (`components/staff/portal-shell.tsx`): sidebar per role, sticky 56px bar with breadcrumbs, Live/Offline dot, "Enable sound" switch, View website, theme; `density-compact`.
- **Agent queue:** groups (Yours, Waiting, Needs the owner, With other agents, awaiting approval) with mono counts; rows are click targets with ticking age (amber past the alert window); plum only on Claim.
- **Fulfilment workspace:** identifier, status, age, actions; `Notice`s for attention, owner instructions, replacements; SIM cards with a QR drop zone (drop, pick or paste; full width on phones) and fields; right rail of `Panel`s; on phones Mark complete in a fixed `ActionBar`.
- **Orders, tickets, activations, customers:** `UrlFilters`, desktop tables, phone card lists, `EmptyState`.
- **Ticket page:** customer message and screenshot, `AnswerForm` (segmented status, one answer), order rail and replacement list.
- **Admin overview:** stat tiles in a hairline grid, "Needs attention" panel, catalogue charts.
- **Admin catalogue:** carriers with logo source captions and an "On website" switch; plans table with website status; plan editor with sticky status rail and live card preview; day package rows that keep headings on phones.
- **Settings and agents:** `FormCard`-style settings with help text; agent rows with SIMs filled, password reset and an on/off switch.
- **Profile menu:** sidebar footer row with initials tile, opening account details, View website and Sign out.

### Charts (admin)

Recharts through `ChartContainer` (`components/ui/chart.tsx`), composed in `components/admin/catalog-charts.tsx`, data from `lib/admin/stats.ts`. `--chart-1` plum and `--chart-2` copper, validated for contrast and colour-vision separation on the card surface in each theme; re-run the dataviz validator before adding a series. 2px lines, 8px ringed dots, bars at most 24px with 4px rounded ends, one y-axis, hairline grid in `--border`. Legends only for two or more series; text uses text tokens. Every chart has a "Show data table" view.
