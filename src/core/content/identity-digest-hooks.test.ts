import { describe, expect, it, vi } from "vitest"

import { installIdentityDigestHook } from "./identity-digest-hooks"

describe("installIdentityDigestHook", () => {
  it("reports SHA-256 digest metadata without input or output values", async () => {
    const originalDigest = vi.fn().mockResolvedValue(new ArrayBuffer(32))
    const subtle = { digest: originalDigest }
    const report = vi.fn()

    expect(installIdentityDigestHook(report, { subtle })).toBe(true)

    const input = new TextEncoder().encode("person@example.test")
    await subtle.digest("SHA-256", input)

    expect(originalDigest).toHaveBeenCalledWith("SHA-256", input)
    expect(report).toHaveBeenCalledWith({
      key: `sha-256:${input.byteLength}`,
      details: { algorithm: "SHA-256", inputBytes: input.byteLength }
    })
    expect(JSON.stringify(report.mock.calls)).not.toContain("person@example.test")
  })

  it("ignores non-SHA-256 digests", async () => {
    const originalDigest = vi.fn().mockResolvedValue(new ArrayBuffer(20))
    const subtle = { digest: originalDigest }
    const report = vi.fn()

    installIdentityDigestHook(report, { subtle })
    await subtle.digest("SHA-1", new Uint8Array([1, 2, 3]))

    expect(report).not.toHaveBeenCalled()
  })
})
