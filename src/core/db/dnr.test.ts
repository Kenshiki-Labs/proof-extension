import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildDynamicBlockRules,
  findInstalledBlockRuleMetadataForRequest,
  getDynamicBlockRuleMetadata,
  installDynamicBlockRules,
  uninstallDynamicBlockRules
} from "./dnr"

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

  it("scopes path rules to tracker domains so broad paths cannot block unrelated vendors", () => {
    const rules = buildDynamicBlockRules(["segment"])
    const filters = rules.map((rule) => rule.condition.urlFilter)

    expect(filters).not.toContain("/v1/track")
    expect(filters).not.toContain("/v1/page")
    expect(filters).toContain("||api.segment.io^/v1/track")
    expect(filters).toContain("||api.segment.io^/v1/page")
  })

  it("does not read chrome.declarativeNetRequest at all — safe when chrome is undefined", () => {
    // Regression test for the Firefox MV2 crash: chrome.declarativeNetRequest
    // does not exist there, and reading it at module scope previously threw
    // before installDynamicBlockRules's own guard ever ran.
    expect(() => buildDynamicBlockRules()).not.toThrow()
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

    await expect(installDynamicBlockRules()).resolves.toEqual({ installed: 0 })
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
      installed: buildDynamicBlockRules(["fullstory"]).length
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

  it("prefers the more specific path rule when the path matches", async () => {
    await installFullstory()

    const metadata = findInstalledBlockRuleMetadataForRequest("https://fullstory.com/rec/page?x=1", "xmlhttprequest")
    expect(metadata?.tracker.id).toBe("fullstory")
    expect(metadata?.path).toBe("/rec/page")
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