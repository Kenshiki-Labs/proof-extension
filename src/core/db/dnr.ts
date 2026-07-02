import type { TrackerRecord } from "~core/contracts/schemas"
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

type ResourceType = (typeof RESOURCE_TYPE)[keyof typeof RESOURCE_TYPE]

export type DynamicBlockRuleMetadata = {
  ruleId: number
  tracker: TrackerRecord
  evidence: string
}

const DEFAULT_RESOURCE_TYPES: ResourceType[] = [
  RESOURCE_TYPE.SCRIPT,
  RESOURCE_TYPE.XMLHTTPREQUEST,
  RESOURCE_TYPE.IMAGE,
  RESOURCE_TYPE.PING
]

const VALID_RESOURCE_TYPES = new Set<string>(Object.values(RESOURCE_TYPE))

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
export function buildDynamicBlockRuleSet(blockedTrackerIds: readonly string[] = []) {
  const { trackers } = validateTrackerDatabase()
  const enabledIds = new Set(blockedTrackerIds)
  const rules: chrome.declarativeNetRequest.Rule[] = []
  const metadata = new Map<number, DynamicBlockRuleMetadata>()

  for (const tracker of trackers) {
    if (tracker.browserAction.blockability !== "network_blockable") continue
    if (!enabledIds.has(tracker.id)) continue

    const resourceTypes = normalizeRequestTypes(
      tracker.match.requestTypes
    ) as chrome.declarativeNetRequest.ResourceType[]

    for (const domain of tracker.match.domains) {
      const ruleId = DYNAMIC_RULE_ID_BASE + rules.length
      rules.push({
        id: ruleId,
        priority: 1,
        action: { type: RULE_ACTION_BLOCK as chrome.declarativeNetRequest.RuleActionType },
        condition: { resourceTypes, urlFilter: domainFilter(domain) }
      })
      metadata.set(ruleId, {
        ruleId,
        tracker,
        evidence: `Request matched ${tracker.id} domain ${domain}.`
      })
    }

    for (const path of tracker.match.paths) {
      const ruleId = DYNAMIC_RULE_ID_BASE + rules.length
      rules.push({
        id: ruleId,
        priority: 1,
        action: { type: RULE_ACTION_BLOCK as chrome.declarativeNetRequest.RuleActionType },
        condition: { resourceTypes, urlFilter: path }
      })
      metadata.set(ruleId, {
        ruleId,
        tracker,
        evidence: `Request matched ${tracker.id} path ${path}.`
      })
    }
  }

  return { metadata, rules }
}

export function getDynamicBlockRuleMetadata(ruleId: number) {
  return buildDynamicBlockRuleSet().metadata.get(ruleId) ?? null
}

function hasDeclarativeNetRequest(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.declarativeNetRequest?.updateDynamicRules)
}

export async function installDynamicBlockRules(blockedTrackerIds: readonly string[] = []) {
  if (!hasDeclarativeNetRequest()) return { installed: 0 }

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
  const removeRuleIds = existingRules
    .map((rule) => rule.id)
    .filter((ruleId) => ruleId >= DYNAMIC_RULE_ID_BASE)
  const addRules = buildDynamicBlockRules(blockedTrackerIds)

  await chrome.declarativeNetRequest.updateDynamicRules({ addRules, removeRuleIds })

  return { installed: addRules.length }
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

  return { removed: removeRuleIds.length }
}
