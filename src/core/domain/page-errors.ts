// Browser-generated ResizeObserver warnings arrive on the error channel but
// are not failures — the browser defers the notifications one frame and
// moves on. Every modern SPA emits these routinely; letting them through
// exhausts the small page-error budget and drowns out real breakage (the
// whole reason the page-error observer exists). Shared between the
// main-world reporter (stop recording new ones) and summary normalization
// (drop stale ones already persisted by older builds).
// Exact matches: browser-censored messages with zero information content.
// "Script error." is what cross-origin scripts report when the browser
// withholds detail; bare "Uncaught error" is our own fallback with no
// location. When a location IS present ("Script error. (site.js:1:2)")
// the entry carries real information and must NOT be dropped — which is
// why these are exact matches, not substrings.
const IGNORED_EXACT_MESSAGES = new Set(["Uncaught error", "Script error."])

const IGNORED_SUBSTRING_MESSAGES = [
  "ResizeObserver loop completed with undelivered notifications.",
  "ResizeObserver loop limit exceeded",
  // No longer captured at all (page async noise, not extension breakage) —
  // kept here so entries persisted by earlier builds drain from storage.
  "Unhandled promise rejection:"
]

export function isIgnoredPageError(message: string) {
  if (IGNORED_EXACT_MESSAGES.has(message.trim())) return true
  return IGNORED_SUBSTRING_MESSAGES.some((ignored) => message.includes(ignored))
}
