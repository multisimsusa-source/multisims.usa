# Design

Recorded from the built Milestone 1 surfaces (public site, portal login, admin catalogue). Describes what exists; change it when the UI changes.

## World

The client's MSU logo sets the identity: a deep plum Didone monogram over copper tracked capitals, on a faint lavender-grey ground. Around it the site is minimalist and flat: hairline borders, crisp radii, no heavy shadows, no gradients except one very soft plum wash behind the home hero. One signature shape, the SIM card's cut corner, appears only on day-package tiles and product-type marks.

Photography carries the travel story the flat UI does not: arriving in the US with a phone that already works. Real US places and real phones, never destinations abroad. Photos are self-hosted in `public/images/` (Unsplash License, credits in `docs/IMAGE_CREDITS.md`), served through `next/image` (AVIF/WebP, blur placeholder), `rounded-xl`, dimmed to 90% in dark mode. Text over a photo always sits on a plum-black scrim (`oklch(0.15-0.17 0.04-0.05 324)`), never on the raw image.

Home page order (Persuade), each section earning a different job:
1. **Hero stage:** on desktop one rounded photo stage (Statue of Liberty from an aircraft window), headline and buttons in white over the dark window frame with a left scrim, live plan picker floating bottom-right (the one floating card, so it alone carries `shadow-pop`). On phones the offer sits on the page, then the photo, then the picker overlapping it.
2. **Partner strip:** label left, carrier logos as one-ink silhouettes, colour on hover.
3. **A real US line:** a 6-column bento. Photo cells (cab on a New York avenue, cafe hotspot, call at a desk) with text below; one brand-soft cell listing the live package lengths as SIM-cut chips. Copy is drawn from the catalogue (lengths, add-on price), never invented.
4. **Two ways to get a US number:** eSIM and SIM card panels, photo on top, product mark half over the photo edge.
5. **Will my phone work?:** photo of a phone in hand beside an iPhone/Android check (hairline-split panels, copper-ink step numbers) and the `*#06#` EID tip in a `<kbd>`.
6. **Plans:** grid from `sm`; on phones a swipe row (84% cards, snap) so six cards do not stack.
7. **Match the days to your trip:** four 3:4 photo cards (city break, beach, road trip, study) with a bottom scrim and white text, gentle 1.03 zoom on hover (off with reduced motion).
8. **From checkout to signal:** airport photo beside the numbered steps.
9. **Dealers:** shop-counter photo beside wholesale points and a contact button.
10. **FAQ**, then 11. **Closing band** (San Francisco at dusk under the plum scrim).

Surfaces alternate page and `bg-canvas` with hairline borders, so the long page keeps a rhythm without cards on cards.

## Colour (tokens in `app/globals.css`)

| Role | Light | Dark | Use |
|---|---|---|---|
| `--brand` / `--primary` | plum `oklch(0.25 0.097 324)` (#36093A) | mauve `oklch(0.82 0.08 330)` | primary buttons, selected tiles and chips, switches, links, logo monogram |
| `--brand-soft` | `oklch(0.948 0.022 324)` | `oklch(0.27 0.05 324)` | eSIM badge and panel, hero wash |
| `--copper` | `oklch(0.61 0.066 61)` (#A07A5A) | `oklch(0.74 0.07 62)` | logo tagline, SIM card mark. Large or graphic use only (3.9:1) |
| `--copper-ink` | `oklch(0.53 0.069 58)` | `oklch(0.78 0.07 62)` | copper text at body sizes (5.4:1) |
| `--background` / `--canvas` | lavender-white / lavender-grey | plum-black | page / banded sections and admin ground |
| `--foreground` | plum-tinted near-black | near-white | text |
| `--muted-foreground` | `oklch(0.49 0.018 315)` | `oklch(0.72 0.014 310)` | secondary text (AA on both grounds) |
| success / warning / danger `-soft` + `-ink` | pale pastel + dark ink | dark tint + light ink | status tags, inline alerts |

Strategy: restrained. Plum is the only saturated colour on screen; copper never carries an action.

## Type

- **Logo only:** Bodoni Moda (`--font-logo`, opsz 24) setting the MSU lockup (`components/site/wordmark.tsx`). This is the final logo.
- **Headings:** Funnel Display (`font-heading`), semibold, tracking -0.02em, line-height 1.1, balanced.
- **Body and UI:** Geist, line-height 1.6, prose capped at 65ch.
- **Numbers:** Geist Mono with tabular figures for prices, days, slugs.

## Shape and depth

- Controls (buttons, inputs, selects, toggles): `rounded-md` (6.4px).
- Cards, dialogs, list containers: `rounded-xl` (11px), `1px` border, no shadow.
- Tags, filter chips, switches: fully rounded.
- `.sim-cut`: cut top-right corner via clip-path, filled surfaces only.
- Popovers and menus: `shadow-pop` (two-layer, under 0.1 opacity). Nothing else casts a shadow.
- Grids of facts use the `gap-px` + `bg-border` hairline technique instead of per-cell borders.

## Components

- **Site header** (`components/site/site-header.tsx`, `header-nav.tsx`): sticky, 64px, translucent with a hairline. Wordmark left, nav truly centred (three-column grid), icons right. The current section (pages under it count, so a plan page marks Plans) gets `aria-current`, foreground text and a 2px plum bar resting on the header line. Theme and Portal Login are 44px ghost icon buttons with styled tooltips; Portal Login keeps its name as the accessible label. On phones: theme, portal icon, a hairline divider, then the menu; the sheet marks the current page with a muted fill and a plum dot, and ends with a Portal Login row explaining who it is for.
- **Plan search** (`components/site/plan-search.tsx`, index built in `header-search.tsx` from the cached catalogue): a 44px search icon first in the header icon group, opened by click, Cmd/Ctrl+K or `/`. A command dialog (shadcn `command` on cmdk, restyled: rounded-xl, 56px input row with a hairline under it, rounded-md 44px items, regular weight) sits at 12vh on desktop and near the top on phones. Empty query: Browse (eSIM plans, SIM card plans) and Carriers with logos. Typing: whole-word matching over carrier, plan name, type, data, hotspot (only when the plan has one), talk, text, network, summary and day lengths, so nonsense returns the empty state with a Browse all plans link. Results show carrier logo, plan name, type and facts, and the from price (on phones the price drops into the details line). Desktop footer hints for arrow keys, Enter and Esc.
- **Plan configurator** (`components/site/plan-configurator.tsx`): day tiles as visually hidden radios, international calling as a labelled switch row, live total in an `aria-live` region, full-width Buy button on mobile.
- **Plan card:** carrier logo and product badge, name, summary, three facts with Phosphor icons (data, hotspot, talk and text; "No hotspot" and talk/text in muted ink), then "From" over the price in mono and the day range under it, with a 40px arrow square that fills plum on hover. The whole card is one stretched link.
- **Plans page** (`app/(site)/plans/page.tsx`, toolbar in `components/site/plans-browser.tsx`): one toolbar row above the grid with a hairline under it. Left: plan count and removable filter tags (brand-soft pills with an x) plus Clear all. Right: three shadcn Selects, 44px, each trigger reading "Label Value" (Product, Carrier, Sort). Menus show live counts in mono; the carrier menu shows logos; options with no plans are disabled. Sort: Recommended (admin order), Lowest price, Highest price, Most data (unlimited first). Choices push to the URL (shareable, Back undoes them) and the grid dims while the next result streams. Phones: Product and Carrier side by side, Sort full width.
- **Footer** (`components/site/site-footer.tsx`): canvas band. Wordmark, one line about the shop and a "Questions? Contact us" link on the left; four link columns on the right (Shop, Carriers read live from the catalogue, Help, For business), two per row on phones with 44px links. A hairline row lists the payment methods (USDT TRC-20, Bitcoin) as bordered tags. Below it the MULTISIMS.USA lockup is set large in the logo face at 7% plum as a quiet signature, sized from the viewport so it never passes the content edge. Bottom bar: copyright with the carrier trademark note, and Back to top.
- **FAQ:** accordion without a container, hairline dividers, plus/minus icons.
- **Dropdowns:** always the shadcn `Select` (Base UI), never a native `<select>`. Trigger matches inputs (h-10, rounded-md, hairline border); popup drops below the trigger (never overlays it), rounded-lg with p-1 inset, rounded-md items, a check on the chosen item, and `shadow-pop`. Pass `items` so the trigger shows labels, and `name` when it sits in a form. Filters apply on selection and live in the URL.
- **Profile menu** (`components/admin/nav-user.tsx`): sidebar footer row with an initials tile (brand-soft), name and email, opening a menu (right on desktop, up on phones) with the account header and role tag, View website, and Sign out in the destructive tone with a pending state. Collapsed, the row is just the avatar with a tooltip.
- **Admin shell:** sticky 56px bar with the sidebar trigger, breadcrumbs (Overview > section > Edit plan; phones show the wordmark instead), a ghost "View website" link and the theme button with a tooltip. Content up to `max-w-6xl`. One `<main>` landmark: `SidebarInset` renders a div.
- **Admin overview:** "New plan" in the header; four stat tiles in a hairline grid (mono figures, two by two on phones); a "Needs attention" panel above the charts listing published-but-hidden plans and carriers on the website with no live plans (amber header, each row a link with its reason), or a one-line green all-clear.
- **Admin plans list:** search field (debounced, in the URL as `q`) plus carrier and product Selects. Desktop is a table: plan name with its URL slug in mono, carrier logo, product badge, packages on sale (with total when some are off), from price, Website status (green "Live" or the amber reason, dot plus words), Published switch, Edit. Phones get one card per plan. Counts read "8 of 12 plans" while filtering.
- **Admin carriers:** each row shows the logo the website shows, captioned Uploaded logo, Built-in logo or No logo; one switch with a visible "On website" / "Hidden" label (no separate status pill).
- **Admin plan editor:** on wide screens a sticky right rail shows the website status with what to do about it, and an inert preview of the exact public plan card as last saved. Day package rows keep column headings on phones (Days, Price, Wholesale in one row; on-sale switch, Save and delete on a second line), and Save only activates after a change.
- **Admin loading:** each admin page renders its title, description and primary action at once; only the data part streams behind a skeleton shaped like it (`components/admin/skeletons.tsx`), so client navigation is instant.
- **Admin lists:** `divide-y` rows inside one bordered container; actions right-aligned; destructive actions behind `ConfirmAction`.
- **Carrier logos** (`components/site/carrier-logo.tsx`): an uploaded logo wins; otherwise a built-in official logo for known carriers (`public/carriers/`, matched on the carrier name by `lib/carrier-logos.ts`), otherwise the name in type. Heights are optically balanced by aspect ratio. The partner strip shows them as one-ink silhouettes (`tone="mono"`) that turn to full colour on hover or focus; plan cards show colour in light mode and white in dark.
- Icons: Phosphor, regular weight in UI, bold inside filled marks and buttons. Server Components import from `@phosphor-icons/react/ssr`.

## Charts (admin)

Recharts through the shadcn `ChartContainer` (`components/ui/chart.tsx`), composed in `components/admin/catalog-charts.tsx`, data from `lib/admin/stats.ts`. Real catalogue data only; no sales charts until orders exist.

- **Colours:** `--chart-1` plum (`#78377c` light, `#b86db1` dark) and `--chart-2` copper (`#b87436` / `#c48141`). Logo plum is too dark for marks, so these are lighter steps of it; both pairs pass the dataviz validator (lightness band, chroma floor, CVD and normal-vision separation, contrast) against the card surface in each mode. Re-run `validate_palette.js` before adding a third series.
- **Marks:** 2px lines with 8px dots ringed in the card colour, range bands at 10% opacity, bars at most 24px with 4px rounded data ends, 2px card-colour gaps between stacked segments. One y-axis per chart, solid hairline grid in `--border`.
- **Labels:** legend for two or more series (rect key for bars, line key for lines), none for a single series. Direct labels are selective: line end value, extreme bars, stacked totals on a right-hand label axis. Text uses text tokens, never series colours.
- **Interaction:** crosshair on line charts, per-bar hover on bar charts; tooltips put the value first with a short line key. Every chart has a "Show data table" view, so no value depends on hover.
- **Responsive:** fixed plot heights include the axis band; on screens under 640px the length axis thins to the ends plus two lengths.

## Motion

Minimal and state-driven: 150-200ms colour transitions, `scale(0.98)` on button press, accordion height animation. No entrance choreography. Everything respects `prefers-reduced-motion`.

- **Route loader:** `nextjs-toploader` in the root layout, a 2px `--brand` hairline at the very top, no spinner, no glow. It only shows when a navigation actually waits on the server; prefetched routes switch instantly.
- **Theme button** (`components/site/theme-toggle.tsx`): ghost icon button, moon in light mode and sun in dark, cross-fading with a small rotate over 200ms. Lives in the site header (all breakpoints), the admin sidebar header and mobile bar, and the portal login bar. First visit follows the system theme; a click pins light or dark.

## Accessibility floor

Touch targets 44px on public pages (40px in admin), visible focus rings in the brand colour, skip link, labels above inputs, errors inline under fields, theme follows the system until the visitor uses the header theme button.
