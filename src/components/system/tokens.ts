// Design tokens for the extension UI (popup + options), mirroring the
// token-driven pattern used in proof/kenshiki-web: named composites of
// Tailwind utility classes, not hardcoded inline styles. One place to
// change the look; components just reference these.

export const TYPE = {
  h1: "text-sm font-semibold",
  label: "font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground",
  body: "text-sm leading-relaxed",
  small: "text-xs leading-relaxed text-muted-foreground",
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
