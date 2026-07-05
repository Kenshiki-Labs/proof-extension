import { describe, expect, it } from "vitest"

import type { ObserverEvent } from "~core/domain/types"
import {
  createRateLimitedReporter,
  isPersistenceEventType,
  normalizePersistenceEvent,
  parseCookieWrite,
  redactIdentifier,
  redactPath
} from "./persistence"

function persistenceEvent(overrides: Partial<ObserverEvent>): ObserverEvent {
  return {
    id: "cookie_observed:https://example.test:cid",
    tabId: 1,
    origin: "https://example.test",
    observedAt: 100,
    source: "api-hook",
    firstParty: true,
    policyLabel: "unknown_first_party",
    eventType: "cookie_observed",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["placeholder from main world"],
    ...overrides
  }
}

describe("redactIdentifier", () => {
  it("masks high-entropy runs and keeps ordinary names", () => {
    expect(redactIdentifier("_ga")).toBe("_ga")
    expect(redactIdentifier("checkout-preferences")).toBe("checkout-preferences")
    expect(redactIdentifier("sid_a1b2c3d4e5f6a7b8c9d0")).toBe("[hidden 24]")
    expect(redactIdentifier("token=eyJhbGciOiJIUzI1NiJ9abc123")).toContain("[hidden")
  })

  it("does not mask long letter-only words", () => {
    expect(redactIdentifier("internationalization")).toBe("internationalization")
  })

  it("caps total length", () => {
    const longKey = "word ".repeat(30)
    expect(redactIdentifier(longKey).length).toBeLessThanOrEqual(65)
    expect(redactIdentifier(longKey).endsWith("…")).toBe(true)
  })
})

describe("redactPath", () => {
  it("drops query strings and masks identifier segments", () => {
    expect(redactPath("/app/")).toBe("/app/")
    expect(redactPath("/user/a1b2c3d4e5f6a7b8c9/profile?token=x")).toBe("/user/[hidden 18]/profile")
  })
})

describe("parseCookieWrite", () => {
  it("extracts the name and size, never the value", () => {
    const parsed = parseCookieWrite("session=super-secret-value-123456; Path=/; Secure; SameSite=Lax")

    expect(parsed.name).toBe("session")
    expect(parsed.valueBytes).toBe("super-secret-value-123456".length)
    expect(parsed.attributes).toBe("path, secure, samesite")
    expect(JSON.stringify(parsed)).not.toContain("super-secret")
  })

  it("redacts identifier-shaped cookie names", () => {
    expect(parseCookieWrite("a1b2c3d4e5f6a7b8c9d0=x").name).toBe("[hidden 20]")
  })

  it("handles assignments without a value separator", () => {
    const parsed = parseCookieWrite("bare")
    expect(parsed.name).toBe("bare")
    expect(parsed.valueBytes).toBe(0)
  })
})

describe("createRateLimitedReporter", () => {
  it("caps repeats per id and total reports", () => {
    const seen: string[] = []
    const report = createRateLimitedReporter<string>((id) => seen.push(id), { maxPerId: 2, maxTotal: 5 })

    for (let i = 0; i < 4; i += 1) report("a", "x")
    for (let i = 0; i < 4; i += 1) report(`b${i}`, "x")

    expect(seen.filter((id) => id === "a")).toHaveLength(2)
    expect(seen).toHaveLength(5)
  })
})

describe("normalizePersistenceEvent", () => {
  it("leaves non-persistence events untouched", () => {
    const event = persistenceEvent({ eventType: "sdk_detected" })
    expect(normalizePersistenceEvent(event)).toBe(event)
    expect(isPersistenceEventType("sdk_detected")).toBe(false)
  })

  it("rebuilds evidence from sanitized details for cookie writes", () => {
    const event = normalizePersistenceEvent(
      persistenceEvent({ details: { name: "session", valueBytes: 25, attributes: "path, secure" } })
    )

    expect(event.confidence).toBe("confirmed")
    expect(event.evidenceTier).toBe("observed")
    expect(event.evidence[0]).toContain('cookie "session"')
    expect(event.evidence[0]).toContain("~25 bytes")
    expect(event.evidence[1]).toContain("never recorded")
  })

  it("re-redacts details on the privileged side even if the page sent raw identifiers", () => {
    const forged = persistenceEvent({
      eventType: "storage_write",
      details: { area: "localStorage", op: "set", key: "jwt_eyJhbGciOiJIUzI1NiJ9abc123", valueBytes: 900 }
    })
    const event = normalizePersistenceEvent(forged)

    expect(JSON.stringify(event)).not.toContain("eyJhbGciOiJIUzI1NiJ9")
    expect(String(event.details?.key)).toContain("[hidden")
  })

  it("never trusts page-supplied status, blockability, or attribution", () => {
    const forged = persistenceEvent({
      eventType: "storage_write",
      status: "mitigated",
      blockability: "network_blockable",
      trackerId: "meta-pixel",
      companyId: "meta",
      firstParty: false,
      confidence: "confirmed",
      details: { area: "sessionStorage", op: "clear" }
    })
    const event = normalizePersistenceEvent(forged)

    expect(event.status).toBe("active")
    expect(event.blockability).toBe("observable_only")
    expect(event.trackerId).toBeUndefined()
    expect(event.companyId).toBeUndefined()
    expect(event.firstParty).toBe(true)
    expect(event.evidence[0]).toContain("cleared all keys")
  })

  it("degrades malformed metadata to weak with generic evidence", () => {
    const event = normalizePersistenceEvent(
      persistenceEvent({ eventType: "indexeddb_access", details: { op: "explode", database: "" } })
    )

    expect(event.confidence).toBe("weak")
    expect(event.evidenceTier).toBe("observed")
    expect(event.details).toBeUndefined()
    expect(event.evidence[0]).toContain("malformed metadata")
  })

  it("describes each surface in plain language", () => {
    const indexeddb = normalizePersistenceEvent(
      persistenceEvent({ eventType: "indexeddb_access", details: { op: "open", database: "app-state" } })
    )
    expect(indexeddb.evidence[0]).toContain('durable database "app-state"')

    const cache = normalizePersistenceEvent(
      persistenceEvent({ eventType: "cache_storage_access", details: { op: "delete", cache: "v1-assets" } })
    )
    expect(cache.evidence[0]).toContain('deleted durable cache "v1-assets"')

    const worker = normalizePersistenceEvent(
      persistenceEvent({
        eventType: "service_worker_registered",
        details: { scriptOrigin: "https://example.test", scopePath: "/app/" }
      })
    )
    expect(worker.evidence[0]).toContain('background worker for scope "/app/"')

    const removal = normalizePersistenceEvent(
      persistenceEvent({ eventType: "storage_write", details: { area: "localStorage", op: "remove", key: "theme" } })
    )
    expect(removal.evidence[0]).toContain('deleted "theme"')
  })

  it("clamps forged byte counts to sane non-negative integers", () => {
    const event = normalizePersistenceEvent(
      persistenceEvent({ details: { name: "cid", valueBytes: -5, attributes: "" } })
    )
    expect(event.details?.valueBytes).toBe(0)

    const huge = normalizePersistenceEvent(
      persistenceEvent({ details: { name: "cid", valueBytes: Number.MAX_SAFE_INTEGER } })
    )
    expect(huge.details?.valueBytes).toBe(1_000_000_000)
  })
})
