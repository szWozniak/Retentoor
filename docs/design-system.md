# Design system – Retentoor

The component library is shadcn/ui (Base UI). Every visual value comes from tokens in `frontend/src/index.css`. Do not use raw Tailwind colours (`red-500`, `emerald-100`, …) or arbitrary values in components.

The system combines two sources:

| Area | Source | Rule |
|---|---|---|
| Colour roles | **Material 3 roles** – brand green taken from the KOWR logo: grass `#007a33` (primary, 5.5:1 on white) and bottle `#004830` (on-primary-container); dark-mode primary `#5fd67f`; near-neutral surfaces (no green/sepia tint) | `primary`, `primary-container`, `secondary`, surface containers, `outline`, `error` come straight from M3 |
| Status colours | M3 pattern (colour + container + on-container) | `success`, `warning`, `error`: use `bg-*-container text-on-*-container`, never colour alone, and always pair them with an icon or text |
| Typography | **gov.pl practice**: Lato (krój identyfikacji administracji, OFL); M3 type roles | only 2 weights (400/700); body 16 px, minimum 13 px; utilities `type-display`, `type-headline`, `type-title`, `type-title-sm`, `type-label`, `type-caption` |
| Shape | Small radii (gov.pl) | 4 px for controls (buttons, fields, chips, badges), 6 px for cards, 8 px for dialogs; `rounded-full` only for switches, step dots, progress bars and counters |
| Elevation | M3: tonal surfaces instead of shadows | cards = `card` (surface-container-lowest) with an `outline-variant` border, no shadow; shadow only on floating layers (popover, dialog) |
| Accessibility | gov.pl / WCAG 2.1 AA | always-visible focus (3 px outline, 2 px offset); links in text underlined; control height 40 px (48 px for `lg`); form field border has `outline` contrast ≥ 3:1 |
| Data visualisation | dataviz palette (validated) | `chart-1…8`, `status-*`: only for charts and map legends |

## Components

- **Button**: `default` (filled, primary action, one per section), `outline` (secondary), `ghost` (tertiary/icon), `link`.
- **Badge** (M3 chip): `default` (primary-container), `secondary`, `outline`, `success`, `warning`, `error`.
- **Alert**: `default`, `info`, `success`, `warning`, `error` (tonal containers).
- **Status banner** (report verdict): the whole tonal container in the status colour. No accent stripes.

## Not allowed (anti-"AI slop")

- gradients, glow, decorative pulsing animations, accent stripes on the left edge;
- raw palette colours and arbitrary `text-[11px]`/`bg-[#…]` values outside the map overlays;
- more than 2 font weights, `tracking-tight` on headings, uppercase eyebrow labels;
- icons used as decoration with no meaning.

Note: gov.pl does not publish a public token package, so we adopt its rules (typeface, readability, focus, links) rather than its exact values.

## Brand

- Name: **Retentoor**. The wordmark is Lato Bold, with "too" in `primary` (a quiet emphasis on the "oo", like two drops).
- Mark: a drop of water held in a field basin, i.e. retention. Files: `docs/brand/retentoor-mark.svg` (mark on a tile, also the favicon) and `docs/brand/retentoor-logo.svg` (horizontal lockup). In the app: `components/Logo.tsx` (`LogoMark` uses `currentColor`).
- Tagline: "asystent retencji wody dla rolnika".
- The mark sits on the `primary` tile (#007a33) with white drawing; minimum size is 16 px (favicon).
