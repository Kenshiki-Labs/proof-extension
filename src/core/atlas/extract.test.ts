import { describe, expect, it } from "vitest"

import { buildDocument, extractLastUpdated, htmlToText, makeExcerpts, MIN_CONTENT_LENGTH, textHash } from "./extract"

describe("htmlToText", () => {
  it("drops scripts and styles, strips tags, and decodes entities", () => {
    const text = htmlToText("<style>.a{color:red}</style><script>steal()</script><p>Hello&amp;bye</p><div>Line two</div>")
    expect(text).not.toContain("steal()")
    expect(text).not.toContain("color:red")
    expect(text).toContain("Hello&bye")
    expect(text).toContain("Line two")
  })

  it("returns an empty string for empty input", () => {
    expect(htmlToText("")).toBe("")
  })
})

describe("extractLastUpdated", () => {
  it("reads a written date in either format", () => {
    expect(extractLastUpdated("Last updated: January 5, 2026.")).toBe("January 5, 2026")
    expect(extractLastUpdated("Effective 01/05/2026")).toBe("01/05/2026")
  })

  it("returns null when no date is present", () => {
    expect(extractLastUpdated("no date here")).toBeNull()
    expect(extractLastUpdated("")).toBeNull()
  })
})

describe("makeExcerpts", () => {
  it("keeps leading paragraphs over the length floor and truncates long ones", () => {
    const para = "x".repeat(50)
    const long = "y".repeat(400)
    const out = makeExcerpts([para, "short", long].join("\n"), 3, 100)
    expect(out[0]).toBe(para)
    expect(out).not.toContain("short")
    expect(out.at(-1)?.endsWith("…")).toBe(true)
  })

  it("returns [] for empty text", () => {
    expect(makeExcerpts("")).toEqual([])
  })
})

describe("buildDocument + textHash", () => {
  it("flags thin content, carries the final url, and hashes deterministically", () => {
    const thin = buildDocument({ url: "https://x.test/p", text: "short" })
    expect(thin.thin_content).toBe(true)
    expect(thin.final_url).toBe("https://x.test/p")

    const full = buildDocument({ url: "https://x.test/p", finalUrl: "https://x.test/final", text: "a".repeat(MIN_CONTENT_LENGTH) })
    expect(full.thin_content).toBe(false)
    expect(full.final_url).toBe("https://x.test/final")
  })

  it("hashes with a stable, collision-distinct fnv1a digest", () => {
    expect(textHash("abc")).toBe(textHash("abc"))
    expect(textHash("abc")).toMatch(/^fnv1a:/)
    expect(textHash("abc")).not.toBe(textHash("abd"))
  })
})
