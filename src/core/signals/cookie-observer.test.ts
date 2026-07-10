import { describe, expect, it } from "vitest"

import { buildCookieObservedEvent, cookieMatchesOrigin, type ObservedCookieMetadata } from "./cookie-observer"

function cookie(overrides: Partial<ObservedCookieMetadata> = {}): ObservedCookieMetadata {
  return {
    name: "session_id",
    domain: "example.test",
    secure: true,
    httpOnly: true,
    session: true,
    sameSite: "lax",
    ...overrides
  }
}

describe("cookieMatchesOrigin", () => {
  it("matches a host-only cookie against the same origin", () => {
    expect(cookieMatchesOrigin("example.test", "https://example.test")).toBe(true)
  })

  it("matches a leading-dot domain cookie against a subdomain origin", () => {
    expect(cookieMatchesOrigin(".example.test", "https://shop.example.test")).toBe(true)
  })

  it("does not match a different site", () => {
    expect(cookieMatchesOrigin("tracker.test", "https://example.test")).toBe(false)
  })

  it("returns false for a malformed origin instead of throwing", () => {
    expect(cookieMatchesOrigin("example.test", "not-a-url")).toBe(false)
  })

  it("returns false for a domain that is only a dot", () => {
    expect(cookieMatchesOrigin(".", "https://example.test")).toBe(false)
  })
})

describe("buildCookieObservedEvent", () => {
  it("returns null for a cookie whose domain does not match the tab's origin", () => {
    const event = buildCookieObservedEvent({
      cookie: cookie({ domain: "tracker.test" }),
      tabId: 1,
      origin: "https://example.test",
      observedAt: 100
    })

    expect(event).toBeNull()
  })

  it("builds a confirmed, observable-only event for a matching first-party HttpOnly cookie", () => {
    const event = buildCookieObservedEvent({
      cookie: cookie(),
      tabId: 1,
      origin: "https://example.test",
      observedAt: 100
    })

    expect(event).toMatchObject({
      id: "cookie_observed:1:example.test:session_id",
      tabId: 1,
      origin: "https://example.test",
      observedAt: 100,
      // extension-scan, not api-hook: this event describes a chrome.cookies
      // read, and display classifiers key HttpOnly/session handling on it.
      source: "extension-scan",
      firstParty: true,
      policyLabel: "unknown_first_party",
      eventType: "cookie_observed",
      blockability: "observable_only",
      status: "active",
      confidence: "confirmed",
      evidenceTier: "observed"
    })
  })

  it("matches a leading-dot cookie domain to a subdomain tab", () => {
    const event = buildCookieObservedEvent({
      cookie: cookie({ domain: ".example.test" }),
      tabId: 1,
      origin: "https://shop.example.test",
      observedAt: 100
    })

    expect(event).not.toBeNull()
  })

  it("describes HttpOnly cookies as unreadable by page JavaScript", () => {
    const event = buildCookieObservedEvent({
      cookie: cookie({ httpOnly: true }),
      tabId: 1,
      origin: "https://example.test",
      observedAt: 100
    })

    expect(event?.evidence[0]).toContain("cannot read it")
  })

  it("describes non-HttpOnly cookies as also readable by page JavaScript", () => {
    const event = buildCookieObservedEvent({
      cookie: cookie({ httpOnly: false }),
      tabId: 1,
      origin: "https://example.test",
      observedAt: 100
    })

    expect(event?.evidence[0]).toContain("can also read")
  })

  it("never records a cookie value, even structurally", () => {
    const event = buildCookieObservedEvent({
      cookie: cookie(),
      tabId: 1,
      origin: "https://example.test",
      observedAt: 100
    })

    expect(Object.keys(event?.details ?? {})).not.toContain("value")
    expect(Object.keys(event?.details ?? {}).sort()).toEqual(["httpOnly", "name", "sameSite", "secure", "session"])
  })

  it("redacts high-entropy cookie names", () => {
    const event = buildCookieObservedEvent({
      cookie: cookie({ name: "sid_a1b2c3d4e5f6a7b8c9d0" }),
      tabId: 1,
      origin: "https://example.test",
      observedAt: 100
    })

    expect(event?.details?.name).toContain("[hidden")
  })
})
