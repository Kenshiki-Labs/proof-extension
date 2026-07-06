import { describe, expect, it } from "vitest"

import { runConsentAudit } from "./audit"

// A policy long enough to clear the thin-content floor and containing a phrase
// the third-party-sharing rule detects.
const POLICY = `We share your personal data with third parties, service providers, and advertising partners. ${"x".repeat(500)}`

function stubFetch(pages: Record<string, { ok?: boolean; status?: number; body: string }>): typeof fetch {
  return (async (url: string) => {
    const page = pages[url]
    if (!page) return { ok: false, status: 404, url, text: async () => "" }
    return { ok: page.ok ?? true, status: page.status ?? 200, url, text: async () => page.body }
  }) as unknown as typeof fetch
}

const ANCHORS = [{ text: "Privacy Policy", href: "https://acme.test/privacy" }]

describe("runConsentAudit", () => {
  it("fetches on-domain policy docs, detects giveups, and records provenance", async () => {
    const record = await runConsentAudit("acme.test", ANCHORS, "https://acme.test", stubFetch({ "https://acme.test/privacy": { body: POLICY } }))
    expect(record.nothingDiscovered).toBe(false)
    expect(record.documents.some((doc) => doc.docType === "privacy_policy" && doc.fetchError === null)).toBe(true)
    expect(record.giveups.length).toBeGreaterThan(0)
  })

  it("skips anchors that resolve off the tab's registrable domain", async () => {
    const record = await runConsentAudit(
      "acme.test",
      [{ text: "Privacy Policy", href: "https://evil.test/privacy" }],
      "https://acme.test",
      stubFetch({ "https://evil.test/privacy": { body: POLICY } })
    )
    expect(record.documents).toHaveLength(0)
    expect(record.giveups).toHaveLength(0)
  })

  it("records a fetch error without inventing findings", async () => {
    const record = await runConsentAudit("acme.test", ANCHORS, "https://acme.test", stubFetch({ "https://acme.test/privacy": { ok: false, status: 403, body: "" } }))
    expect(record.documents[0]?.fetchError).toBe("http_403")
    expect(record.giveups).toHaveLength(0)
  })

  it("keeps thin documents in provenance but out of detection", async () => {
    const record = await runConsentAudit("acme.test", ANCHORS, "https://acme.test", stubFetch({ "https://acme.test/privacy": { body: "too short to be a policy" } }))
    expect(record.documents[0]?.thinContent).toBe(true)
    expect(record.giveups).toHaveLength(0)
  })

  it("flags nothingDiscovered when no legal links are present", async () => {
    const record = await runConsentAudit("acme.test", [{ text: "Home", href: "https://acme.test/home" }], "https://acme.test", stubFetch({}))
    expect(record.nothingDiscovered).toBe(true)
    expect(record.documents).toHaveLength(0)
  })
})
