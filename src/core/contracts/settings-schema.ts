import * as z from "zod"

import { VISIT_FREQUENCIES, type VisitFrequency } from "~core/domain/visit-frequency"

// Split from schemas.ts (the no-god-files ratchet): user settings are their
// own contract surface. schemas.ts re-exports both, so import sites are
// unchanged — ~core/contracts/schemas stays the single import path.

export const VisitFrequencySchema = z.enum(VISIT_FREQUENCIES as [VisitFrequency, ...VisitFrequency[]])

export const UserSettingsSchema = z.object({
  retentionDays: z.number().int().min(1).max(365),
  maxEventsPerTab: z.number().int().min(1).max(500),
  // Observer first, not a blocker: blocking is opt-in and per-tracker (from
  // the popup), empty by default so install never changes site behavior.
  blockedTrackerIds: z.array(z.string().min(1)),
  // Page-safe alternative to blocking: script served by a local shim
  // (core/db/shims.ts), return path closed. .default keeps old settings parseable.
  shimmedTrackerIds: z.array(z.string().min(1)).default([]),
  mitigateCanvas: z.boolean(),
  mitigateAudio: z.boolean(),
  mitigateWebgl: z.boolean(),
  // Global Privacy Control: opt-in like everything else — installing the
  // extension never changes what a site receives by itself. When true, a
  // Sec-GPC: 1 request header is emitted (Chromium DNR) and the MAIN-world
  // observer exposes navigator.globalPrivacyControl. .default keeps old
  // settings parseable.
  gpcEnabled: z.boolean().default(false),
  skipReportOpenConfirm: z.boolean(),
  cookieMetadataEnabled: z.boolean().default(false),
  // Per-domain stated visit rate; .default({}) keeps old settings parseable.
  siteVisitFrequency: z.record(z.string(), VisitFrequencySchema).default({})
})
