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

export function buildDynamicBlockRules() {
  const { trackers } = validateTrackerDatabase()
  const rules: chrome.declarativeNetRequest.Rule[] = []

  for (const tracker of trackers) {
    if (tracker.browserAction.blockability !== "network_blockable") continue

    const resourceTypes = normalizeRequestTypes(
      tracker.match.requestTypes
    ) as chrome.declarativeNetRequest.ResourceType[]

    for (const domain of tracker.match.domains) {
      rules.push({
        id: DYNAMIC_RULE_ID_BASE + rules.length,
        priority: 1,
        action: { type: RULE_ACTION_BLOCK as chrome.declarativeNetRequest.RuleActionType },
        condition: { resourceTypes, urlFilter: domainFilter(domain) }
      })
    }

    for (const path of tracker.match.paths) {
      rules.push({
        id: DYNAMIC_RULE_ID_BASE + rules.length,
        priority: 1,
        action: { type: RULE_ACTION_BLOCK as chrome.declarativeNetRequest.RuleActionType },
        condition: { resourceTypes, urlFilter: path }
      })
    }
  }

  return rules
}

function hasDeclarativeNetRequest(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.declarativeNetRequest?.updateDynamicRules)
}

export async function installDynamicBlockRules() {
  if (!hasDeclarativeNetRequest()) return { installed: 0 }

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
  const removeRuleIds = existingRules
    .map((rule) => rule.id)
    .filter((ruleId) => ruleId >= DYNAMIC_RULE_ID_BASE)
  const addRules = buildDynamicBlockRules()

  await chrome.declarativeNetRequest.updateDynamicRules({ addRules, removeRuleIds })

  return { installed: addRules.length }
}
