// Browser-generated ResizeObserver warnings arrive on the error channel but
// are not failures — the browser defers the notifications one frame and
// moves on. Every modern SPA emits these routinely; letting them through
// exhausts the small page-error budget and drowns out real breakage (the
// whole reason the page-error observer exists). Shared between the
// main-world reporter (stop recording new ones) and summary normalization
// (drop stale ones already persisted by older builds).
const IGNORED_ERROR_MESSAGES = [
  "Uncaught error",
  "ResizeObserver loop completed with undelivered notifications.",
  "ResizeObserver loop limit exceeded",
  // No longer captured at all (page async noise, not extension breakage) —
  // kept here so entries persisted by earlier builds drain from storage.
  "Unhandled promise rejection:"
]

export function isIgnoredPageError(message: string) {
  return IGNORED_ERROR_MESSAGES.some((ignored) => message === ignored || message.includes(ignored))
}
