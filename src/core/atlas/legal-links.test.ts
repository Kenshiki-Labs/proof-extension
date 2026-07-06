import { describe, expect, it } from "vitest"

import { classifyAnchor, discoverLegalLinks, resolveUrl } from "./legal-links"

describe("classifyAnchor", () => {
  it("classifies by text, most-specific type first", () => {
    expect(classifyAnchor({ text: "Cookie Policy" })?.type).toBe("cookie_policy")
    expect(classifyAnchor({ text: "Subscription Billing" })?.type).toBe("subscription_terms")
    expect(classifyAnchor({ text: "Community Guidelines" })?.type).toBe("community_guidelines")
    expect(classifyAnchor({ text: "Privacy Policy" })?.type).toBe("privacy_policy")
    expect(classifyAnchor({ text: "Terms of Service" })?.type).toBe("terms_of_use")
  })

  it("classifies by href when the text is unhelpful", () => {
    expect(classifyAnchor({ text: "here", href: "https://x.test/privacy" })?.type).toBe("privacy_policy")
  })

  it("raises confidence when text and url agree", () => {
    const both = classifyAnchor({ text: "Privacy Policy", href: "https://x.test/privacy" })
    const textOnly = classifyAnchor({ text: "Privacy Policy" })
    expect(both?.confidence ?? 0).toBeGreaterThan(textOnly?.confidence ?? 0)
  })

  it("returns null for empty, missing, or unrelated anchors", () => {
    expect(classifyAnchor({})).toBeNull()
    expect(classifyAnchor(null)).toBeNull()
    expect(classifyAnchor(undefined)).toBeNull()
    expect(classifyAnchor({ text: "Home", href: "https://x.test/home" })).toBeNull()
  })
})

describe("resolveUrl", () => {
  it("resolves a relative href against the base", () => {
    expect(resolveUrl("/privacy", "https://x.test/page")).toBe("https://x.test/privacy")
  })

  it("keeps an absolute href", () => {
    expect(resolveUrl("https://y.test/privacy", "https://x.test")).toBe("https://y.test/privacy")
  })

  it("rejects non-navigable and unparseable hrefs", () => {
    expect(resolveUrl("#section")).toBeNull()
    expect(resolveUrl("javascript:void(0)")).toBeNull()
    expect(resolveUrl("mailto:a@b.test")).toBeNull()
    expect(resolveUrl("tel:123")).toBeNull()
    expect(resolveUrl(undefined)).toBeNull()
    expect(resolveUrl("::::")).toBeNull()
  })
})

describe("discoverLegalLinks", () => {
  it("groups the best candidate per type and dedupes by url", () => {
    const byType = discoverLegalLinks(
      [
        { text: "Privacy Policy", href: "/privacy" },
        { text: "Privacy", href: "/privacy" },
        { text: "Terms of Use", href: "/terms" },
        { text: "Home", href: "/home" }
      ],
      "https://x.test"
    )
    expect(byType.privacy_policy?.[0]?.url).toBe("https://x.test/privacy")
    expect(byType.privacy_policy).toHaveLength(1)
    expect(byType.terms_of_use?.[0]?.url).toBe("https://x.test/terms")
    expect(Object.keys(byType)).not.toContain("home")
  })

  it("handles empty or missing anchor lists", () => {
    expect(discoverLegalLinks([], "https://x.test")).toEqual({})
    expect(discoverLegalLinks(undefined as unknown as [], "https://x.test")).toEqual({})
  })
})
