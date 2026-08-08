# BA4THG QSO Archive — Design System

## Intent

This is an amateur-radio logbook and archive, not a marketing landing page. The interface should feel like a precise, quiet station utility: compact, readable, trustworthy, and fast.

Design dials:
- DESIGN_VARIANCE: 3/10
- MOTION_INTENSITY: 1/10
- VISUAL_DENSITY: 7/10

## Visual language

- Dense but not cramped.
- Prefer structure, borders, typography, and alignment over shadows and decorative surfaces.
- Avoid oversized hero typography, giant statistic cards, pill-heavy UI, decorative section-number eyebrows, gradients, glass effects, and ornamental motion.
- Public logbook and admin console share the same design system, but the admin page may be denser.

## Color tokens

- `--canvas`: #f6f7f8
- `--surface`: #ffffff
- `--surface-subtle`: #f1f3f5
- `--ink`: #172026
- `--muted`: #68737d
- `--line`: #d9dee3
- `--line-strong`: #bcc5cd
- `--accent`: #176b87
- `--accent-strong`: #0f536a
- `--success`: #25724d
- `--danger`: #b34444

The accent is functional only: active navigation, primary actions, status marks, links, and focus states.

## Typography

System fonts only. No external font dependency.

- UI/body: `Segoe UI Variable`, `PingFang SC`, `Microsoft YaHei UI`, system-ui, sans-serif.
- Callsigns / frequencies / compact machine-like data: `Cascadia Mono`, `SFMono-Regular`, Consolas, monospace.
- Heading sizes are restrained. Callsign is the largest element, but should not exceed roughly 64px on desktop.
- Avoid extreme negative tracking.

## Layout

- Main content max width: 1180px.
- Header height: about 60px.
- Desktop page padding: 28–36px.
- Mobile page padding: 14–18px.
- Vertical rhythm: 16 / 20 / 28 / 36px.
- Public page order: station identity → query controls → metrics → logbook.
- Admin page order: compact heading → authentication bar → entry/tools → recent records.

## Components

### Header
- White or near-white surface, 1px bottom border.
- No blur-heavy glass treatment.
- Active nav uses accent text and a subtle underline/bottom border.

### Station identity
- Not a giant hero.
- Callsign + short role/QTH line on the left.
- Compact station facts on the right.
- May use a thin accent rule or status dot, not illustration.

### Panels
- 1px border, 10–12px radius.
- No large drop shadow.
- Background is white.
- Internal padding 18–24px.

### Inputs
- 38–42px height.
- 7–8px radius.
- Quiet neutral background.
- Clear focus ring.

### Buttons
- 7–8px radius, not pills.
- Primary uses accent fill.
- Secondary uses white background + border.
- Hover may change background/border only; no bouncing/translate animation.

### Metrics
- One compact horizontal strip or four aligned cells.
- No oversized independent cards.
- Numbers are prominent but not decorative.

### QSO records
- Read like structured log rows.
- Callsign, timestamp, frequency/mode/band form the primary scan line.
- Equipment/QTH/RST use compact definition-grid formatting.
- QSL state is a small tag, not a large badge.
- Notes use a subtle top divider.

## Motion

- No entrance animations.
- No parallax.
- No scroll-triggered motion.
- Only short 100–160ms state transitions for hover/focus/background/border.
- Respect `prefers-reduced-motion`.

## Responsive behavior

- Under ~860px, station facts stack below identity and query controls wrap into two columns.
- Under ~620px, query and admin forms become one column.
- QSO metadata may collapse from 3 columns to 2 then 1.
- Keep touch targets at least 40px high.

## Guardrails

Do not add:
- giant display headings,
- marketing copy,
- gradient backgrounds,
- glassmorphism,
- decorative blobs,
- excessive rounded cards,
- fake dashboard widgets,
- section labels like `01 / QUERY`,
- excessive uppercase microcopy,
- automatic carousels,
- unnecessary animation libraries.

The result should look like a well-designed radio log utility, not an AI-generated SaaS landing page.
