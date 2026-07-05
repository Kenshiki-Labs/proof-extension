---
title: "Extension Design Primitives"
description: "Root primitive guide for Pulse Observer popup, report, and value-ledger surfaces."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-05
status: active
---

## Purpose

Pulse Observer is an instrument panel, not a marketing page. The UI should feel dense, factual, and inspectable. It should use color and elevation to separate evidence layers, not to decorate.

## Primitive Sources

- Global CSS tokens live in `src/style.css`.
- Class composites live in `src/components/system/tokens.ts`.
- Shared controls live in `src/components/system/*`.
- Domain-specific surfaces, such as value-ledger tables, should be composed from these primitives before introducing new utility clusters.

## Surface Rules

- Use `UI.panel` for top-level report and popup panels.
- Use `UI.subtlePanel` for nested cards inside a panel.
- Use `UI.metricCard` for KPI/value cards.
- Use `UI.tableShell`, `UI.tableHeader`, and `UI.tableRow` for report tables.
- Use `UI.segment`, `UI.segmentActive`, and `UI.segmentIdle` for segmented controls.
- Do not add inline `style` props. Promote the shape into a primitive.

## Component Primitives

Component-level primitives live in `src/components/system/` (structural, zero domain knowledge) and `src/components/watchers/` (domain-bound; they enforce the docs/surface-contract.md vocabulary structurally). A primitive exists only if it deletes at least two duplications, and primitives are presentation-only — counting and selection happen in `src/core/`.

- `SurfaceSection` — the one section header (optional icon or number marker). Replaces the popup/report private heading variants.
- `Disclosure` — collapsed-by-default `<details>` with standard summary styling.
- `Chip` — status/tier/category pill; tones reuse the class combinations the private implementations already used.
- `CategoryChip` — renders functional-category labels only from `FUNCTIONAL_CATEGORY_LABELS`; surfaces cannot hand-type taxonomy.
- `WatcherList` / `WatcherRow` — the one renderer of "a watcher" for popup and report; all selection, ranking, naming, and "+N more" arithmetic live in `src/core/report/watchers.ts`.
- `VerdictBanner` — the identical verdict element on both product surfaces; always renders, including an explicit empty state.
- `DebugView` — the fail-open surface; the only component allowed to render pipeline vocabulary and the `DEBUG_METRICS` catalog.

## Elevation

Elevation must communicate hierarchy:

- Page canvas: `bg-background`.
- Panels: border + `--panel-shadow`.
- Nested surfaces: border + `--panel-shadow-soft`.
- Raised/interactive surfaces: use `ELEVATION.raised` only through a shared primitive.

Do not sprinkle `shadow-*` utilities directly into feature components unless the class is already part of a primitive.

## Color

Use token colors and semantic Tailwind aliases:

- `foreground`, `background`, `card`, `border`, `muted-foreground`
- `signal` for the product accent
- `danger` for failure/error states
- restrained status tones already used by the popup (`amber`, `emerald`, `sky`) for state labels only

Raw hex/rgb/hsl values belong only in `src/style.css`.

## Typography

- Section labels use `TYPE.label`.
- Body copy uses `TYPE.body`.
- Supporting copy uses `TYPE.small`.
- Numeric KPI values use tabular alignment and display weight through `UI.metricCard`.

Do not use hero-scale text inside popup/report panels.

## Icons

Use Lucide icons for compact actions and high-level metric categories. Icons should identify controls or scan targets; they should not replace evidence text.

Icon-only controls must include:

- `aria-label`
- visible hover/focus tooltip
- `title` as browser fallback

## Guardrail

Run `pnpm design:check` to catch primitive drift. It bans inline styles and raw color/font-size values outside the token files. `pnpm qa` runs this check.
