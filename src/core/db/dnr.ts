import type { TrackerRecord } from "~core/contracts/schemas"
import { shimForTrackerId } from "~core/db/shims"
import { validateTrackerDatabase } from "~core/db/validate"

const DYNAMIC_RULE_ID_BASE = 10_000

// Literal MV3 resource-type/action-type strings, not chrome.declarativeNetRequest.*
// enum reads: those enums only exist on Chromium. Reading them at module scope
// (rather than inside a chrome-guarded function) crashed the whole background
// script on Firefox, where `chrome.declarativeNetRequest` is undefined.
const RESOURCE_TYPE = {
  MAIN_FRAME: "main_frame",
  SUB_FRAME: "sub_frame",
  STYLESHEET: "stylesheet",
  SCRIPT: "script",
  IMAGE: "image",
  FONT: "font",
  OBJECT: "object",
  XMLHTTPREQUEST: "xmlhttprequest",
  PING: "ping",
  CSP_REPORT: "csp_report",
  MEDIA: "media",
  WEBSOCKET: "websocket",
  OTHER: "other"
} as const

const RULE_ACTION_BLOCK = "block"
const RULE_ACTION_REDIRECT = "redirect"

type ResourceType = (typeof RESOURCE_TYPE)[keyof typeof RESOURCE_TYPE]

export type DynamicRuleAction = "block" | "shim"

export type DynamicBlockRuleMetadata = {
  ruleId: number
  action: DynamicRuleAction
  tracker: TrackerRecord
  evidence: string
  domain: string
  resourceTypes: readonly string[]
}

const DEFAULT_RESOURCE_TYPES: ResourceType[] = [RESOURCE_TYPE.SCRIPT, RESOURCE_TYPE.XMLHTTPREQUEST, RESOURCE_TYPE.IMAGE, RESOURCE_TYPE.PING]

const VALID_RESOURCE_TYPES = new Set<string>(Object.values(RESOURCE_TYPE))
let installedDynamicBlockRuleMetadata = new Map<number, DynamicBlockRuleMetadata>()

function normalizeRequestTypes(types: string[]): ResourceType[] {
  const normalized = types.filter((type): type is ResourceType => VALID_RESOURCE_TYPES.has(type))
  return normalized.length > 0 ? normalized : DEFAULT_RESOURCE_TYPES
}

function domainFilter(domain: string) {
  return `||${domain}^`
}

export function buildDynamicBlockRules(blockedTrackerIds: readonly string[] = []) {
  return buildDynamicBlockRuleSet(blockedTrackerIds).rules
}

// Blocking is a per-tracker choice made from the popup, not a single global
// switch — blockedTrackerIds is the list of tracker ids the user has
// explicitly turned on. A tracker being network_blockable in the DB just
// means blocking is *possible* for it; whether it's actually blocked right
// now depends on the user having opted that specific one in.
//
// shimmedTrackerIds is the page-safe sibling: instead of blocking, the
// tracker's script is redirected to a local impostor (core/db/shims.ts) so
// the page keeps working while nothing reaches the tracker. Shim wins over
// block for the same tracker — a shim is a block plus page safety.
export function buildDynamicBlockRuleSet(blockedTrackerIds: readonly string[] = [], shimmedTrackerIds: readonly string[] = []) {
  const { trackers } = validateTrackerDatabase()
  const shimmedIds = new Set(shimmedTrackerIds.filter((trackerId) => shimForTrackerId(trackerId)))
  const enabledIds = new Set(blockedTrackerIds.filter((trackerId) => !shimmedIds.has(trackerId)))
  const rules: chrome.declarativeNetRequest.Rule[] = []
  const metadata = new Map<number, DynamicBlockRuleMetadata>()

  const addRule = (
    tracker: TrackerRecord,
    domain: string,
    action: chrome.declarativeNetRequest.RuleAction,
    resourceTypes: chrome.declarativeNetRequest.ResourceType[],
    ruleMeta: Pick<DynamicBlockRuleMetadata, "action" | "evidence">
  ) => {
    const ruleId = DYNAMIC_RULE_ID_BASE + rules.length
    rules.push({
      id: ruleId,
      priority: 1,
      action,
      condition: { resourceTypes, urlFilter: domainFilter(domain) }
    })
    metadata.set(ruleId, { ruleId, tracker, domain, resourceTypes, ...ruleMeta })
  }

  for (const tracker of trackers) {
    const shim = shimmedIds.has(tracker.id) ? shimForTrackerId(tracker.id) : null

    if (shim) {
      // Shims bypass the network_blockable gate on purpose: high-breakage
      // trackers are exactly the ones that need the page-safe path. Scripts
      // get the impostor, image beacons get the local pixel, and the
      // fire-and-forget return path (XHR/ping) is blocked outright.
      for (const domain of tracker.match.domains) {
        addRule(
          tracker,
          domain,
          { type: RULE_ACTION_REDIRECT as chrome.declarativeNetRequest.RuleActionType, redirect: { extensionPath: shim.scriptPath } },
          [RESOURCE_TYPE.SCRIPT] as chrome.declarativeNetRequest.ResourceType[],
          { action: "shim", evidence: `Script from ${tracker.id} domain ${domain} replaced with the local page-safe shim.` }
        )
        addRule(
          tracker,
          domain,
          { type: RULE_ACTION_REDIRECT as chrome.declarativeNetRequest.RuleActionType, redirect: { extensionPath: shim.imagePath } },
          [RESOURCE_TYPE.IMAGE] as chrome.declarativeNetRequest.ResourceType[],
          { action: "shim", evidence: `Beacon to ${tracker.id} domain ${domain} answered by the local pixel.` }
        )
        addRule(
          tracker,
          domain,
          { type: RULE_ACTION_BLOCK as chrome.declarativeNetRequest.RuleActionType },
          [RESOURCE_TYPE.XMLHTTPREQUEST, RESOURCE_TYPE.PING] as chrome.declarativeNetRequest.ResourceType[],
          { action: "shim", evidence: `Return path to ${tracker.id} domain ${domain} closed.` }
        )
      }
      continue
    }

    if (tracker.browserAction.blockability !== "network_blockable") continue
    if (!enabledIds.has(tracker.id)) continue

    const resourceTypes = normalizeRequestTypes(tracker.match.requestTypes) as chrome.declarativeNetRequest.ResourceType[]

    // Domain-wide rules only. Path-scoped rules (`||domain^/path`) were dead
    // syntax — in DNR urlFilter, `^` consumes the `/`, so the literal path
    // could never match — and even fixed they would be strictly subsumed by
    // these same-priority domain rules while burning dynamic-rule quota.
    for (const domain of tracker.match.domains) {
      addRule(tracker, domain, { type: RULE_ACTION_BLOCK as chrome.declarativeNetRequest.RuleActionType }, resourceTypes, {
        action: "block",
        evidence: `Request matched ${tracker.id} domain ${domain}.`
      })
    }
  }

  return { metadata, rules }
}

export function getDynamicBlockRuleMetadata(ruleId: number) {
  return installedDynamicBlockRuleMetadata.get(ruleId) ?? null
}

// Why: onRuleMatchedDebug only fires in unpacked dev builds. In a packed
// build the deterministic block signal is webRequest.onErrorOccurred with
// net::ERR_BLOCKED_BY_CLIENT — but that error alone could come from another
// extension. The claim "Pulse blocked this" is only honest when the failed
// request provably matches a rule this extension actually installed, so
// this re-derives the match from the same domain/path/resource-type facts
// the installed rules were built from. Pure map/string work: no chrome API
// reads, safe on Firefox.
export function findInstalledBlockRuleMetadataForRequest(url: string, resourceType: string): DynamicBlockRuleMetadata | null {
  if (installedDynamicBlockRuleMetadata.size === 0) return null

  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }

  for (const metadata of installedDynamicBlockRuleMetadata.values()) {
    if (!metadata.resourceTypes.includes(resourceType)) continue
    const hostMatches = hostname === metadata.domain || hostname.endsWith(`.${metadata.domain}`)
    if (hostMatches) return metadata
  }

  return null
}

function hasDeclarativeNetRequest(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.declarativeNetRequest?.updateDynamicRules)
}

// Global Privacy Control request header. Lives BELOW DYNAMIC_RULE_ID_BASE on
// purpose: every blocking-sync path filters on `ruleId >= DYNAMIC_RULE_ID_BASE`
// before removing rules, so the GPC rule survives block/shim reinstalls and
// uninstalls untouched, and vice versa.
export const GPC_RULE_ID = 9_999

// The header is the legally meaningful half of GPC (CCPA regs treat Sec-GPC
// as a valid do-not-sell/share opt-out); the JS half
// (navigator.globalPrivacyControl) is exposed by the MAIN-world observer.
// Chromium-only: Firefox MV2 has no DNR — its builds rely on the browser's
// own built-in GPC setting instead, and this is a silent no-op there.
export function buildGpcHeaderRule(): chrome.declarativeNetRequest.Rule {
  return {
    id: GPC_RULE_ID,
    priority: 1,
    action: {
      type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
      requestHeaders: [
        {
          header: "Sec-GPC",
          operation: "set" as chrome.declarativeNetRequest.HeaderOperation,
          value: "1"
        }
      ]
    },
    condition: {
      urlFilter: "*",
      resourceTypes: Object.values(RESOURCE_TYPE) as chrome.declarativeNetRequest.ResourceType[]
    }
  }
}

// Idempotent: installs or removes exactly the one GPC rule to match the
// setting. Called on hydration and on every gpcEnabled change.
export async function syncGpcHeaderRule(enabled: boolean): Promise<{ active: boolean }> {
  if (!hasDeclarativeNetRequest()) return { active: false }

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
  const installed = existingRules.some((rule) => rule.id === GPC_RULE_ID)

  if (enabled && !installed) {
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [buildGpcHeaderRule()] })
  } else if (!enabled && installed) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [GPC_RULE_ID] })
  }

  return { active: enabled }
}

const FALLBACK_DYNAMIC_RULE_LIMIT = 30_000

export async function installDynamicBlockRules(blockedTrackerIds: readonly string[] = [], shimmedTrackerIds: readonly string[] = []) {
  if (!hasDeclarativeNetRequest()) return { installed: 0, requested: 0 }

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
  const removeRuleIds = existingRules.map((rule) => rule.id).filter((ruleId) => ruleId >= DYNAMIC_RULE_ID_BASE)
  const { metadata, rules } = buildDynamicBlockRuleSet(blockedTrackerIds, shimmedTrackerIds)

  // Never let one over-quota update reject wholesale: that would leave the
  // previous rules installed while the caller believes the new set is live.
  // Trim to the browser's dynamic-rule budget (minus rules that aren't ours)
  // and report requested vs installed so callers can surface the shortfall.
  const foreignRuleCount = existingRules.length - removeRuleIds.length
  // MAX_NUMBER_OF_DYNAMIC_RULES shipped in Chrome 121; @types/chrome doesn't declare it yet.
  const ruleLimit =
    (chrome.declarativeNetRequest as { MAX_NUMBER_OF_DYNAMIC_RULES?: number }).MAX_NUMBER_OF_DYNAMIC_RULES ?? FALLBACK_DYNAMIC_RULE_LIMIT
  const available = Math.max(0, ruleLimit - foreignRuleCount)
  const addRules = rules.slice(0, available)

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules, removeRuleIds })
  } catch (error) {
    // The update failed atomically: the browser kept the previous rules, so
    // keep the previous metadata rather than claiming the new set installed.
    console.warn("Failed to install dynamic block rules", error)
    return { installed: 0, requested: rules.length, error: error instanceof Error ? error.message : String(error) }
  }

  const installedIds = new Set(addRules.map((rule) => rule.id))
  installedDynamicBlockRuleMetadata = new Map([...metadata].filter(([ruleId]) => installedIds.has(ruleId)))

  return { installed: addRules.length, requested: rules.length }
}

// Blocking is opt-in and per-tracker (see UserSettings.blockedTrackerIds) —
// this removes any previously installed managed rules so a user turning a
// tracker's blocking off actually stops it immediately, not just stops
// future installs.
export async function uninstallDynamicBlockRules() {
  if (!hasDeclarativeNetRequest()) return { removed: 0 }

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
  const removeRuleIds = existingRules.map((rule) => rule.id).filter((ruleId) => ruleId >= DYNAMIC_RULE_ID_BASE)

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds })
  installedDynamicBlockRuleMetadata = new Map()

  return { removed: removeRuleIds.length }
}
