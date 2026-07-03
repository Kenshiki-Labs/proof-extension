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
  card: "shadow-sm",
  raised: "shadow-sm hover:shadow"
}

export const INSET = {
  compact: "p-3",
  card: "p-4"
}

export const UI = {
  panel: "border border-border bg-card shadow-[var(--panel-shadow)]",
  inset: "p-3.5",
  reportInset: "p-4 sm:p-5",
  subtlePanel: "border border-border bg-background/55",
  divider: "border-t border-border"
}
