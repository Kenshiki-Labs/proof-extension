import { describe, expect, it } from "vitest"

import { isSameSite, registrableDomain } from "./party"

describe("registrableDomain", () => {
  it("collapses subdomains to the registrable domain", () => {
    expect(registrableDomain("www.cnn.com")).toBe("cnn.com")
    expect(registrableDomain("media.cnn.com")).toBe("cnn.com")
    expect(registrableDomain("a.b.c.example.org")).toBe("example.org")
  })

  it("keeps three labels for common multi-part TLDs", () => {
    expect(registrableDomain("news.bbc.co.uk")).toBe("bbc.co.uk")
    expect(registrableDomain("shop.example.com.au")).toBe("example.com.au")
  })

  it("returns bare and single-label hosts unchanged", () => {
    expect(registrableDomain("example.com")).toBe("example.com")
    expect(registrableDomain("localhost")).toBe("localhost")
  })

  it("never splits IP addresses into labels", () => {
    expect(registrableDomain("192.168.1.10")).toBe("192.168.1.10")
    expect(registrableDomain("2606:4700::1111")).toBe("2606:4700::1111")
  })

  it("normalizes case and trailing dots", () => {
    expect(registrableDomain("WWW.CNN.COM.")).toBe("cnn.com")
  })
})

describe("isSameSite", () => {
  it("treats a site's own subdomains as same-site", () => {
    expect(isSameSite("www.cnn.com", "media.cnn.com")).toBe(true)
  })

  it("treats different registrable domains as cross-site", () => {
    expect(isSameSite("www.cnn.com", "cadmus.script.ac")).toBe(false)
    expect(isSameSite("www.cnn.com", "services.brightline.tv")).toBe(false)
  })

  it("requires exact match for IP hosts", () => {
    expect(isSameSite("192.168.1.10", "192.168.1.11")).toBe(false)
    expect(isSameSite("192.168.1.10", "192.168.1.10")).toBe(true)
  })

  it("does not confuse lookalike suffixes", () => {
    expect(isSameSite("cnn.com", "not-cnn.com")).toBe(false)
    expect(isSameSite("bbc.co.uk", "cbbc.co.uk")).toBe(false)
  })
})
