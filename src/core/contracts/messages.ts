import * as z from "zod"

import { ContentScriptSettingsSchema } from "~core/contracts/content-settings"
import {
  ConsentAuditRecordSchema,
  CookieMetadataScanResultSchema,
  CookieValueInspectResultSchema,
  ObserverEventSchema,
  PageErrorSchema,
  RollingValuationSummarySchema,
  SiteSummarySchema,
  UserSettingsSchema,
  ValuationPeriodSchema
} from "~core/contracts/schemas"

// THE runtime message contract between the extension surfaces (popup, options,
// report tab, content scripts) and the background worker. Sender authorization
// lives in ~core/messaging/router: OBSERVED_EVENT, PAGE_ERROR_OBSERVED,
// GET_CONTENT_SCRIPT_SETTINGS, and GET_BLOCK_MARKER_STATE are the whole
// content-script API; everything else requires an extension-page sender.
export const RuntimeMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("OBSERVED_EVENT"), payload: ObserverEventSchema }),
  z.object({ type: z.literal("PAGE_ERROR_OBSERVED"), payload: PageErrorSchema.omit({ id: true }) }),
  z.object({ type: z.literal("GET_SITE_SUMMARY"), tabId: z.number().int() }),
  z.object({ type: z.literal("SITE_SUMMARY"), payload: SiteSummarySchema }),
  z.object({ type: z.literal("GET_COOKIE_METADATA_PERMISSION") }),
  z.object({ type: z.literal("REQUEST_COOKIE_METADATA_PERMISSION") }),
  z.object({ type: z.literal("COOKIE_METADATA_PERMISSION"), granted: z.boolean() }),
  z.object({ type: z.literal("SCAN_SITE_COOKIES"), tabId: z.number().int() }),
  z.object({ type: z.literal("COOKIE_METADATA_SCAN"), payload: CookieMetadataScanResultSchema }),
  z.object({ type: z.literal("INSPECT_SITE_COOKIE_VALUES"), tabId: z.number().int() }),
  z.object({ type: z.literal("COOKIE_VALUE_INSPECT"), payload: CookieValueInspectResultSchema }),
  z.object({ type: z.literal("GET_VALUATION_ROLLUP"), period: ValuationPeriodSchema }),
  z.object({ type: z.literal("VALUATION_ROLLUP"), payload: RollingValuationSummarySchema }),
  z.object({ type: z.literal("REFRESH_TAB_SCAN"), tabId: z.number().int() }),
  z.object({ type: z.literal("RUN_CONSENT_AUDIT"), tabId: z.number().int() }),
  z.object({ type: z.literal("CONSENT_AUDIT"), payload: ConsentAuditRecordSchema }),
  z.object({ type: z.literal("CONSENT_AUDIT_FAILED"), reason: z.enum(["no_tab", "restricted_page", "anchor_harvest_failed"]) }),
  z.object({
    type: z.literal("GENERATE_AI_AUDIT_REPORT"),
    payload: z.object({
      tabId: z.number().int(),
      auditPayload: z.string().min(1)
    })
  }),
  z.object({ type: z.literal("AI_AUDIT_REPORT"), payload: z.object({ report: z.string().min(1) }) }),
  z.object({ type: z.literal("AI_AUDIT_REPORT_FAILED"), error: z.string().min(1) }),
  z.object({ type: z.literal("GET_CONTENT_SCRIPT_SETTINGS") }),
  z.object({ type: z.literal("CONTENT_SCRIPT_SETTINGS"), payload: ContentScriptSettingsSchema }),
  z.object({ type: z.literal("GET_BLOCK_MARKER_STATE") }),
  z.object({ type: z.literal("BLOCK_MARKER_STATE"), payload: z.object({ active: z.boolean() }) }),
  z.object({ type: z.literal("GET_SETTINGS") }),
  z.object({ type: z.literal("SETTINGS"), payload: UserSettingsSchema }),
  z.object({ type: z.literal("UPDATE_SETTINGS"), payload: UserSettingsSchema.partial() }),
  z.object({ type: z.literal("CLEAR_VALUATION_LEDGER") }),
  z.object({ type: z.literal("CLEAR_LOCAL_DATA") })
])
