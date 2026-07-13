import { validateTrackerDatabase } from "~core/db/validate"

// Single source of truth for whether the UI may offer a block toggle and
// whether the background may install a DNR rule. High breakage risk means
// blocking would break visible site functionality (forms, chat, tag
// delivery) — the extension observes and explains instead of offering a
// toggle that generates support-ticket breakage.

export type BlockingGuidance = { offerBlocking: true; warning: string | null } | { offerBlocking: false; reason: string }

let cachedBreakage: Map<string, { risk: "low" | "medium" | "high"; note: string; affects: string[] }> | null = null

function breakageByTrackerId() {
  if (!cachedBreakage) {
    cachedBreakage = new Map(validateTrackerDatabase().trackers.map((tracker) => [tracker.id, tracker.browserAction.siteBreakage]))
  }
  return cachedBreakage
}

export function blockingGuidance(trackerId: string | undefined): BlockingGuidance {
  const breakage = trackerId ? breakageByTrackerId().get(trackerId) : undefined
  // Unknown tracker: nothing to block deterministically anyway.
  if (!breakage) return { offerBlocking: false, reason: "No reviewed tracker record backs a block rule for this observation." }

  if (breakage.risk === "high") {
    const affects = breakage.affects.length > 0 ? ` Affects: ${breakage.affects.join(", ")}.` : ""
    return { offerBlocking: false, reason: `Blocking disabled: ${breakage.note}${affects}` }
  }
  if (breakage.risk === "medium") {
    return { offerBlocking: true, warning: breakage.note }
  }
  return { offerBlocking: true, warning: null }
}

// Defense in depth for the background: even if a high-risk id reaches
// settings (older stored state, forged message), no DNR rule is installed.
export function filterBlockableTrackerIds(trackerIds: string[]): string[] {
  return trackerIds.filter((trackerId) => blockingGuidance(trackerId).offerBlocking)
}
