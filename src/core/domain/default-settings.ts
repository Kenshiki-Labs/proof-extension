import type { UserSettings } from "~core/domain/types"

// THE settings default — the background's hydration merge and every
// surface's pre-load state must agree on it, so it exists exactly once.
// Observer first, not a blocker: blockedTrackerIds/shimmedTrackerIds start
// empty so installing/enabling the extension never changes site behavior by
// itself. Blocking and mitigation are per-tracker choices made from the
// popup, right where that tracker is observed — not a single global switch.
export const DEFAULT_SETTINGS: UserSettings = {
  retentionDays: 14,
  maxEventsPerTab: 100,
  blockedTrackerIds: [],
  shimmedTrackerIds: [],
  mitigateCanvas: false,
  mitigateAudio: false,
  mitigateWebgl: false,
  skipReportOpenConfirm: false,
  cookieMetadataEnabled: false,
  siteVisitFrequency: {}
}
