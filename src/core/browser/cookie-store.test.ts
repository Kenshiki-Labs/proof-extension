import { describe, expect, it } from "vitest"

import { hasCookieMetadataPermission, inspectSiteCookieValues, requestCookieMetadataPermission, scanSiteCookieMetadata, type CookieStoreChromeApi } from "./cookie-store"

function apiFixture({
  containsGranted = true,
  requestGranted = true,
  cookies = []
}: {
  containsGranted?: boolean
  requestGranted?: boolean
  cookies?: chrome.cookies.Cookie[]
} = {}): CookieStoreChromeApi {
  return {
    cookies: {
      getAll: (_details, callback) => callback(cookies)
    },
    permissions: {
      contains: (_permissions, callback) => callback(containsGranted),
      request: (_permissions, callback) => callback(requestGranted)
    },
    runtime: {}
  }
}

function cookie(overrides: Partial<chrome.cookies.Cookie> = {}): chrome.cookies.Cookie {
  return {
    domain: "example.test",
    expirationDate: 1800000000,
    hostOnly: true,
    httpOnly: true,
    name: "session_id",
    path: "/",
    sameSite: "lax",
    secure: true,
    session: false,
    storeId: "0",
    value: "must-not-cross-boundary",
    ...overrides
  }
}

describe("cookie-store adapter", () => {
  it("reports unsupported when Chrome cookie APIs are unavailable", async () => {
    await expect(hasCookieMetadataPermission({})).resolves.toBe(false)
    await expect(requestCookieMetadataPermission({})).resolves.toBe(false)
    await expect(scanSiteCookieMetadata({ api: {}, origin: "https://example.test", tabId: 1 })).resolves.toEqual({
      status: "unsupported",
      events: []
    })
  })

  it("does not scan when optional cookie permission has not been granted", async () => {
    const result = await scanSiteCookieMetadata({
      api: apiFixture({ containsGranted: false, cookies: [cookie()] }),
      origin: "https://example.test",
      tabId: 1
    })

    expect(result).toEqual({ status: "permission_required", events: [] })
  })

  it("requests the optional cookie permission", async () => {
    await expect(requestCookieMetadataPermission(apiFixture({ requestGranted: true }))).resolves.toBe(true)
    await expect(requestCookieMetadataPermission(apiFixture({ requestGranted: false }))).resolves.toBe(false)
  })

  it("converts browser cookies into metadata-only extension-scan events", async () => {
    const result = await scanSiteCookieMetadata({
      api: apiFixture({ cookies: [cookie()] }),
      observedAt: 100,
      origin: "https://example.test",
      tabId: 1
    })

    expect(result.status).toBe("available")
    expect(result.events).toHaveLength(1)
    const event = result.events[0]
    if (!event) throw new Error("Expected one cookie metadata event")
    expect(event).toMatchObject({
      eventType: "cookie_observed",
      source: "extension-scan",
      confidence: "confirmed",
      evidenceTier: "observed",
      details: {
        name: "session_id",
        httpOnly: true,
        secure: true,
        session: false,
        sameSite: "lax"
      }
    })
    expect(JSON.stringify(event)).not.toContain("must-not-cross-boundary")
    expect(Object.keys(event.details ?? {})).not.toContain("value")
  })

  it("keeps unrelated-domain cookies out of the tab summary", async () => {
    const result = await scanSiteCookieMetadata({
      api: apiFixture({ cookies: [cookie({ domain: "tracker.test" })] }),
      origin: "https://example.test",
      tabId: 1
    })

    expect(result).toEqual({ status: "available", events: [] })
  })

  it("rejects restricted origins before reading cookies", async () => {
    const result = await scanSiteCookieMetadata({
      api: apiFixture({ cookies: [cookie()] }),
      origin: "chrome://extensions",
      tabId: 1
    })

    expect(result).toEqual({ status: "restricted_page", events: [] })
  })

  it("reveals current-site cookie values only through explicit inspect results", async () => {
    const result = await inspectSiteCookieValues({
      api: apiFixture({ cookies: [cookie(), cookie({ domain: "tracker.test", name: "tracker", value: "tracker-value" })] }),
      origin: "https://example.test"
    })

    expect(result).toMatchObject({
      status: "available",
      cookies: [{ name: "session_id", value: "must-not-cross-boundary", httpOnly: true }]
    })
    expect(JSON.stringify(result)).not.toContain("tracker-value")
  })

  it("does not reveal values without optional cookie permission", async () => {
    await expect(inspectSiteCookieValues({
      api: apiFixture({ containsGranted: false, cookies: [cookie()] }),
      origin: "https://example.test"
    })).resolves.toEqual({ status: "permission_required", cookies: [] })
  })

  it("treats a permission-check runtime error as not granted", async () => {
    const api: CookieStoreChromeApi = {
      cookies: { getAll: (_details, callback) => callback([]) },
      permissions: {
        contains: (_permissions, callback) => callback(true),
        request: (_permissions, callback) => callback(true)
      },
      runtime: { lastError: { message: "permission bridge failed" } }
    }
    await expect(hasCookieMetadataPermission(api)).resolves.toBe(false)
    await expect(requestCookieMetadataPermission(api)).resolves.toBe(false)
    await expect(scanSiteCookieMetadata({ api, origin: "https://example.test", tabId: 1 })).resolves.toEqual({ status: "permission_required", events: [] })
  })

  it("returns no events when the cookie read itself errors", async () => {
    let call = 0
    const api: CookieStoreChromeApi = {
      cookies: { getAll: (_details, callback) => callback([cookie()]) },
      permissions: {
        // First call (permission check) succeeds; the read then errors.
        contains: (_permissions, callback) => callback(true),
        request: (_permissions, callback) => callback(true)
      },
      get runtime() {
        // lastError is unset for the permission check, set for the read.
        return call++ === 0 ? {} : { lastError: { message: "cookie read failed" } }
      }
    }
    await expect(scanSiteCookieMetadata({ api, observedAt: 1, origin: "https://example.test", tabId: 1 })).resolves.toEqual({ status: "available", events: [] })
  })

  it("treats an unparseable origin as a restricted page", async () => {
    await expect(scanSiteCookieMetadata({ api: apiFixture({ cookies: [cookie()] }), origin: "http://[", tabId: 1 })).resolves.toEqual({ status: "restricted_page", events: [] })
  })
})
