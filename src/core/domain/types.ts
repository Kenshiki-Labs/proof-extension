export type BlockabilityClass =
  | "network_blockable"
  | "content_mitigatable"
  | "observable_only"
  | "pre_request_unblockable"
  | "server_side_unblockable"
  | "user_action_required"

export type ObservationStatus = "active" | "blocked" | "mitigated" | "cannot_block"

export type DetectionConfidence = "confirmed" | "probable" | "weak"

export type FirstPartyPolicyLabel =
  | "site_functionality"
  | "security_or_fraud"
  | "analytics"
  | "fingerprinting"
  | "behavioral_profiling"
  | "unknown_first_party"

export type ObserverEvent = {
  id: string
  tabId: number
  frameId?: number | undefined
  origin: string
  observedAt: number
  source: "network" | "content" | "api-hook"
  trackerId?: string | undefined
  companyId?: string | undefined
  firstParty: boolean
  policyLabel?: FirstPartyPolicyLabel | undefined
  eventType:
    | "request_seen"
    | "request_blocked"
    | "script_injected"
    | "canvas_read"
    | "audio_fingerprint"
    | "webgl_query"
    | "font_enumeration"
    | "cookie_sync"
    | "webrtc_probe"
  blockability: BlockabilityClass
  status: ObservationStatus
  confidence: DetectionConfidence
  evidence: string[]
  details?: Record<string, string | number | boolean> | undefined
}

export type SiteSummary = {
  origin: string
  tabId: number
  activeCompanies: string[]
  blockedCompanies: string[]
  mitigatedCompanies: string[]
  exposedSignals: string[]
  cannotBlockSignals: string[]
  events: ObserverEvent[]
  incomplete: boolean
  updatedAt: number
}

export type UserSettings = {
  retentionDays: number
  mitigateCanvas: boolean
  mitigateAudio: boolean
  mitigateWebgl: boolean
}

export type RuntimeMessage =
  | { type: "OBSERVED_EVENT"; payload: ObserverEvent }
  | { type: "GET_SITE_SUMMARY"; tabId: number }
  | { type: "SITE_SUMMARY"; payload: SiteSummary }
  | { type: "REFRESH_TAB_SCAN"; tabId: number }
  | { type: "UPDATE_SETTINGS"; payload: Partial<UserSettings> }
  | { type: "CLEAR_LOCAL_DATA" }