import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  installCacheStorageHooks,
  installCookieWriteHook,
  installIndexedDbHooks,
  installServiceWorkerHook,
  installStorageWriteHooks,
  type PersistenceObservation
} from "./persistence-hooks"

function collect() {
  const observations: PersistenceObservation[] = []
  return { observations, report: (observation: PersistenceObservation) => observations.push(observation) }
}

describe("installCookieWriteHook", () => {
  it("reports metadata for document.cookie writes and preserves the write", () => {
    const { observations, report } = collect()
    expect(installCookieWriteHook(report, document)).toBe(true)

    document.cookie = "prefs=dark-mode; Path=/"

    expect(observations).toHaveLength(1)
    expect(observations[0]).toMatchObject({
      eventType: "cookie_observed",
      key: "prefs",
      details: { name: "prefs", valueBytes: 9, attributes: "path" }
    })
    // The write itself must still land — the hook only observes.
    expect(document.cookie).toContain("prefs=dark-mode")
    expect(JSON.stringify(observations)).not.toContain("dark-mode")
  })
})

describe("installStorageWriteHooks", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it("reports set/remove/clear with sizes but never values", () => {
    const { observations, report } = collect()
    expect(installStorageWriteHooks(report, window)).toBe(true)

    window.localStorage.setItem("theme", "dark-and-secret")
    window.sessionStorage.removeItem("draft")
    window.localStorage.clear()

    const kinds = observations.map((observation) => `${observation.details.area}:${observation.details.op}`)
    expect(kinds).toContain("localStorage:set")
    expect(kinds).toContain("sessionStorage:remove")
    expect(kinds).toContain("localStorage:clear")

    const setObservation = observations.find((observation) => observation.details.op === "set")
    expect(setObservation?.details.key).toBe("theme")
    expect(setObservation?.details.valueBytes).toBe("dark-and-secret".length)
    expect(JSON.stringify(observations)).not.toContain("dark-and-secret")

    expect(window.localStorage.getItem("theme")).toBeNull() // cleared
  })
})

describe("installIndexedDbHooks", () => {
  it("reports open and delete with the database name", () => {
    const { observations, report } = collect()
    const open = vi.fn().mockReturnValue("open-result")
    const deleteDatabase = vi.fn().mockReturnValue("delete-result")
    const factory = { open, deleteDatabase }

    expect(installIndexedDbHooks(report, factory)).toBe(true)
    expect(factory.open("app-state", 3)).toBe("open-result")
    expect(factory.deleteDatabase("app-state")).toBe("delete-result")

    expect(open).toHaveBeenCalledWith("app-state", 3)
    expect(observations.map((observation) => observation.details.op)).toEqual(["open", "deleteDatabase"])
    expect(observations[0]?.details.database).toBe("app-state")
  })

  it("returns false when the API is absent", () => {
    const { report } = collect()
    expect(installIndexedDbHooks(report, null)).toBe(false)
  })
})

describe("installCacheStorageHooks", () => {
  it("reports cache names for open/delete/has but never a match URL", () => {
    const { observations, report } = collect()
    const caches = {
      open: vi.fn().mockResolvedValue("cache"),
      delete: vi.fn().mockResolvedValue(true),
      match: vi.fn().mockResolvedValue(undefined),
      has: vi.fn().mockResolvedValue(true)
    }

    expect(installCacheStorageHooks(report, caches)).toBe(true)
    void caches.open("v1-assets")
    void caches.match("https://example.test/secret?token=abc123def456ghi789")
    void caches.has("v1-assets")

    expect(observations.map((observation) => observation.details.op)).toEqual(["open", "match", "has"])
    expect(observations[1]?.details.cache).toBe("(lookup across caches)")
    expect(JSON.stringify(observations)).not.toContain("token=abc")
  })
})

describe("installServiceWorkerHook", () => {
  it("reports script origin and scope path, dropping filenames and queries", () => {
    const { observations, report } = collect()
    const register = vi.fn().mockResolvedValue("registration")
    const container = { register }

    expect(installServiceWorkerHook(report, container, "https://example.test")).toBe(true)
    void container.register("/sw.js?v=abc123def456ghi789jkl")

    expect(register).toHaveBeenCalled()
    expect(observations[0]).toMatchObject({
      eventType: "service_worker_registered",
      details: { scriptOrigin: "https://example.test", scopePath: "/" }
    })
    expect(JSON.stringify(observations)).not.toContain("abc123def456")
  })

  it("honors an explicit scope option", () => {
    const { observations, report } = collect()
    const container = { register: vi.fn() }

    installServiceWorkerHook(report, container, "https://example.test")
    void container.register("/workers/sw.js", { scope: "/app/" })

    expect(observations[0]?.details.scopePath).toBe("/app/")
  })
})
