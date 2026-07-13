import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildDynamicBlockRules,
  buildDynamicBlockRuleSet,
  findInstalledBlockRuleMetadataForRequest,
  getDynamicBlockRuleMetadata,
  installDynamicBlockRules,
  uninstallDynamicBlockRules
} from "./dnr"

const REDIRECT = "redirect" as chrome.declarativeNetRequest.RuleActionType
const BLOCK = "block" as chrome.declarativeNetRequest.RuleActionType

describe("buildDynamicBlockRules", () => {
  it("builds blocking rules from the tracker database", () => {
    const rules = buildDynamicBlockRules(["fullstory"])

    expect(rules.length).toBeGreaterThan(0)
    expect(rules.some((rule) => rule.condition.urlFilter === "||fullstory.com^")).toBe(true)
    expect(rules.some((rule) => rule.action.type === chrome.declarativeNetRequest.RuleActionType.BLOCK)).toBe(true)
  })

  it("builds no rules until a tracker is explicitly selected", () => {
    expect(buildDynamicBlockRules()).toEqual([])
  })

  it("does not add protected-vendor allow rules from the DNR builder", () => {
    const rules = buildDynamicBlockRules(["segment"])

    expect(rules.some((rule) => rule.condition.urlFilter?.includes("mapbox.com"))).toBe(false)
    expect(rules.some((rule) => rule.priority === 1 && rule.action.type === chrome.declarativeNetRequest.RuleActionType.BLOCK)).toBe(true)
  })

  it("emits domain-wide rules only — no path-scoped filters (dead `||domain^/path` syntax, subsumed by domain rules)", () => {
    const rules = buildDynamicBlockRules(["segment"])
    const filters = rules.map((rule) => rule.condition.urlFilter)

    expect(filters).toContain("||api.segment.io^")
    expect(filters.every((filter) => filter !== undefined && /\^$/.test(filter))).toBe(true)
  })

  it("does not read chrome.declarativeNetRequest at all — safe when chrome is undefined", () => {
    // Regression test for the Firefox MV2 crash: chrome.declarativeNetRequest
    // does not exist there, and reading it at module scope previously threw
    // before installDynamicBlockRules's own guard ever ran.
    expect(() => buildDynamicBlockRules()).not.toThrow()
  })
})

// Page-safe shims: redirect the tracker's script to a local impostor and
// close the return path, instead of blocking (which breaks pages).
describe("buildDynamicBlockRuleSet with shimmed trackers", () => {
  it("redirects scripts to the shim, beacons to the pixel, and blocks the XHR/ping return path", () => {
    const { rules, metadata } = buildDynamicBlockRuleSet([], ["google-analytics"])

    const script = rules.find(
      (rule) =>
        rule.action.type === REDIRECT && rule.condition.resourceTypes?.includes("script" as chrome.declarativeNetRequest.ResourceType)
    )
    expect(script?.action.redirect?.extensionPath).toBe("/shims/gtag.js")
    expect(script?.condition.urlFilter).toBe("||google-analytics.com^")

    const image = rules.find(
      (rule) =>
        rule.action.type === REDIRECT && rule.condition.resourceTypes?.includes("image" as chrome.declarativeNetRequest.ResourceType)
    )
    expect(image?.action.redirect?.extensionPath).toBe("/shims/pixel.gif")

    const returnPath = rules.find((rule) => rule.action.type === BLOCK)
    expect(returnPath?.condition.resourceTypes).toEqual(["xmlhttprequest", "ping"])

    // Every shim rule's metadata carries the honest action label.
    expect([...metadata.values()].every((entry) => entry.action === "shim")).toBe(true)
  })

  it("shims the high-breakage tracker that blocking can never touch (google-tag-manager is user_action_required)", () => {
    expect(buildDynamicBlockRules(["google-tag-manager"])).toEqual([])

    const { rules } = buildDynamicBlockRuleSet([], ["google-tag-manager"])
    expect(rules.some((rule) => rule.action.redirect?.extensionPath === "/shims/gtag.js")).toBe(true)
  })

  it("shim wins over block for the same tracker — no duplicate block rules", () => {
    const { rules } = buildDynamicBlockRuleSet(["google-analytics"], ["google-analytics"])

    const blockRules = rules.filter((rule) => rule.action.type === BLOCK)
    // Only the shim's own return-path block remains, scoped to xhr/ping.
    expect(blockRules).toHaveLength(1)
    expect(blockRules[0]?.condition.resourceTypes).toEqual(["xmlhttprequest", "ping"])
  })

  it("ignores shimmed ids without a shipped shim resource", () => {
    const { rules } = buildDynamicBlockRuleSet([], ["fullstory"])
    expect(rules).toEqual([])
  })
})

describe("installDynamicBlockRules", () => {
  const originalChrome = globalThis.chrome

  afterEach(() => {
    vi.stubGlobal("chrome", originalChrome)
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules).mockClear()
    vi.mocked(chrome.declarativeNetRequest.updateDynamicRules).mockClear()
  })

  it("no-ops instead of throwing when chrome is entirely undefined (Firefox MV2)", async () => {
    vi.stubGlobal("chrome", undefined)

    await expect(installDynamicBlockRules()).resolves.toEqual({ installed: 0, requested: 0 })
  })

  it("replaces managed dynamic rules in Chromium", async () => {
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules).mockResolvedValueOnce([
      {
        id: 10_000,
        priority: 1,
        action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
        condition: { urlFilter: "||old.example^" }
      },
      {
        id: 9_999,
        priority: 1,
        action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
        condition: { urlFilter: "||user.example^" }
      }
    ])

    await expect(installDynamicBlockRules(["fullstory"])).resolves.toEqual({
      installed: buildDynamicBlockRules(["fullstory"]).length,
      requested: buildDynamicBlockRules(["fullstory"]).length
    })

    expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith(
      expect.objectContaining({
        removeRuleIds: [10_000],
        addRules: expect.arrayContaining([
          expect.objectContaining({ condition: expect.objectContaining({ urlFilter: "||fullstory.com^" }) })
        ])
      })
    )
  })

  it("trims to the dynamic-rule quota instead of letting the whole update reject, and reports the shortfall", async () => {
    const requested = buildDynamicBlockRules(["fullstory"]).length
    expect(requested).toBeGreaterThan(1)
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules).mockResolvedValueOnce([])
    const dnrApi = chrome.declarativeNetRequest as { MAX_NUMBER_OF_DYNAMIC_RULES?: number }
    dnrApi.MAX_NUMBER_OF_DYNAMIC_RULES = 1

    try {
      await expect(installDynamicBlockRules(["fullstory"])).resolves.toEqual({ installed: 1, requested })
      const addRules = vi.mocked(chrome.declarativeNetRequest.updateDynamicRules).mock.calls.at(-1)?.[0].addRules ?? []
      expect(addRules).toHaveLength(1)
      // Metadata only covers what actually installed — no attribution for trimmed rules.
      expect(getDynamicBlockRuleMetadata(addRules[0]!.id)).toBeTruthy()
      expect(getDynamicBlockRuleMetadata(addRules[0]!.id + 1)).toBeNull()
    } finally {
      delete dnrApi.MAX_NUMBER_OF_DYNAMIC_RULES
    }
  })

  it("keeps the previous metadata when the browser rejects the update — never claims rules that did not install", async () => {
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules).mockResolvedValueOnce([])
    vi.mocked(chrome.declarativeNetRequest.updateDynamicRules).mockRejectedValueOnce(new Error("quota exceeded"))

    const result = await installDynamicBlockRules(["fullstory"])
    expect(result.installed).toBe(0)
    expect(result.requested).toBeGreaterThan(0)
    expect(result.error).toContain("quota exceeded")
  })

  it("keeps metadata for installed dynamic block rules", async () => {
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules).mockResolvedValueOnce([])

    await installDynamicBlockRules(["fullstory"])
    const installedRules = vi.mocked(chrome.declarativeNetRequest.updateDynamicRules).mock.calls.at(-1)?.[0].addRules ?? []
    const fullstoryRule = installedRules.find((rule) => rule.condition.urlFilter === "||fullstory.com^")
    expect(fullstoryRule).toBeTruthy()

    const metadata = getDynamicBlockRuleMetadata(fullstoryRule!.id)
    expect(metadata).toMatchObject({
      ruleId: fullstoryRule!.id,
      tracker: { id: "fullstory" },
      evidence: "Request matched fullstory domain fullstory.com."
    })
  })
})

describe("uninstallDynamicBlockRules", () => {
  const originalChrome = globalThis.chrome

  afterEach(() => {
    vi.stubGlobal("chrome", originalChrome)
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules).mockClear()
    vi.mocked(chrome.declarativeNetRequest.updateDynamicRules).mockClear()
  })

  it("no-ops instead of throwing when chrome is entirely undefined (Firefox MV2)", async () => {
    vi.stubGlobal("chrome", undefined)

    await expect(uninstallDynamicBlockRules()).resolves.toEqual({ removed: 0 })
  })

  it("removes only our managed rules, leaving any other rule intact — turning blocking off actually stops it", async () => {
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules).mockResolvedValueOnce([
      {
        id: 10_000,
        priority: 1,
        action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
        condition: { urlFilter: "||fullstory.com^" }
      },
      {
        id: 9_999,
        priority: 1,
        action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
        condition: { urlFilter: "||user.example^" }
      }
    ])

    await expect(uninstallDynamicBlockRules()).resolves.toEqual({ removed: 1 })

    expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({ removeRuleIds: [10_000] })
  })

  it("clears installed metadata when uninstalling dynamic block rules", async () => {
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 10_000,
          priority: 1,
          action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
          condition: { urlFilter: "||fullstory.com^" }
        }
      ])

    await installDynamicBlockRules(["fullstory"])
    const installedRules = vi.mocked(chrome.declarativeNetRequest.updateDynamicRules).mock.calls.at(-1)?.[0].addRules ?? []
    expect(getDynamicBlockRuleMetadata(installedRules[0]!.id)).toBeTruthy()

    await uninstallDynamicBlockRules()
    expect(getDynamicBlockRuleMetadata(installedRules[0]!.id)).toBeNull()
  })
})

// The production blocked-state path: onErrorOccurred + ERR_BLOCKED_BY_CLIENT
// is only claimed as OUR block when the URL re-matches an installed rule.
describe("findInstalledBlockRuleMetadataForRequest", () => {
  afterEach(async () => {
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules).mockResolvedValue([])
    await uninstallDynamicBlockRules()
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules).mockClear()
    vi.mocked(chrome.declarativeNetRequest.updateDynamicRules).mockClear()
  })

  async function installFullstory() {
    vi.mocked(chrome.declarativeNetRequest.getDynamicRules).mockResolvedValueOnce([])
    await installDynamicBlockRules(["fullstory"])
  }

  it("matches a blocked request to the installed tracker rule by domain suffix", async () => {
    await installFullstory()

    const metadata = findInstalledBlockRuleMetadataForRequest("https://edge.fullstory.com/s/fs.js", "script")
    expect(metadata?.tracker.id).toBe("fullstory")
    expect(metadata?.evidence).toContain("fullstory")
  })

  it("attributes a blocked request on any path to the domain rule", async () => {
    await installFullstory()

    const metadata = findInstalledBlockRuleMetadataForRequest("https://fullstory.com/rec/page?x=1", "xmlhttprequest")
    expect(metadata?.tracker.id).toBe("fullstory")
    expect(metadata?.evidence).toContain("domain fullstory.com")
  })

  it("returns null when no rules are installed — another extension's block is never claimed", async () => {
    expect(findInstalledBlockRuleMetadataForRequest("https://edge.fullstory.com/s/fs.js", "script")).toBeNull()
  })

  it("returns null for hosts outside installed rule domains", async () => {
    await installFullstory()

    expect(findInstalledBlockRuleMetadataForRequest("https://www.google-analytics.com/g/collect", "script")).toBeNull()
    expect(findInstalledBlockRuleMetadataForRequest("https://not-fullstory.com/s/fs.js", "script")).toBeNull()
  })

  it("returns null for resource types outside the rule's coverage", async () => {
    await installFullstory()

    expect(findInstalledBlockRuleMetadataForRequest("https://edge.fullstory.com/s/fs.js", "font")).toBeNull()
  })

  it("returns null for unparseable URLs", async () => {
    await installFullstory()

    expect(findInstalledBlockRuleMetadataForRequest("not a url", "script")).toBeNull()
  })
})
