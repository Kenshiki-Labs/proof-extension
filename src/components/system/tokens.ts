// Design tokens for the extension UI (popup + options), mirroring the
// token-driven pattern used in proof/kenshiki-web: named composites of
// Tailwind utility classes, not hardcoded inline styles. One place to
// change the look; components just reference these.

export const TYPE = {
  h1: "font-display text-base font-semibold tracking-tight",
  label: "font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground leading-none",
  body: "text-sm leading-[1.65]",
  small: "text-xs leading-[1.6] text-muted-foreground",
  mono: "font-mono text-xs"
}

export const SPACE = {
  section: "mt-6",
  stack: "mt-2"
}

export const ELEVATION = {
  flat: "",
  card: "shadow-[var(--panel-shadow)]",
  raised: "shadow-[var(--panel-shadow-raised)]"
}

export const INSET = {
  compact: "p-2.5",
  card: "p-3"
}

export const UI = {
  panel: `border border-border bg-card ${ELEVATION.card}`,
  inset: "p-3",
  reportInset: "p-3 sm:p-4",
  denseInset: "p-2.5 sm:p-3",
  subtlePanel: "border border-border bg-background/55 shadow-[var(--panel-shadow-soft)]",
  densePanel: "border border-border bg-background/55 p-2.5 shadow-[var(--panel-shadow-soft)] sm:p-3",
  metricCard: `border border-border bg-card p-2.5 ${ELEVATION.card} sm:p-3`,
  metricValue: "mt-1 font-display text-xl font-semibold tracking-tight tabular-nums sm:text-2xl",
  statStrip: "grid gap-2 sm:grid-cols-2 lg:grid-cols-4",
  tableShell: "overflow-x-auto border border-border bg-card p-2 shadow-[var(--panel-shadow-soft)] sm:p-3",
  tableHeader: "border-b border-border bg-background/70",
  tableRow: "border-t border-border align-top hover:bg-background/55",
  segment: "border px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.08em] transition-colors",
  segmentActive: "border-foreground bg-foreground text-background",
  segmentIdle: "border-border bg-card text-muted-foreground hover:border-foreground hover:text-foreground",
  divider: "border-t border-border"
}
