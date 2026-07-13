import { describe, expect, it } from "vitest"

import { resolveBlockabilityStatus } from "./status"

describe("resolveBlockabilityStatus", () => {
  it("only marks network-blockable observations as blocked after a block action", () => {
    expect(resolveBlockabilityStatus("network_blockable")).toBe("active")
    expect(resolveBlockabilityStatus("network_blockable", { blocked: true })).toBe("blocked")
  })

  it("only marks content-mitigatable observations as mitigated after mitigation", () => {
    expect(resolveBlockabilityStatus("content_mitigatable")).toBe("active")
    expect(resolveBlockabilityStatus("content_mitigatable", { mitigated: true })).toBe("mitigated")
  })

  it("marks pre-request and server-side exposures as cannot-block", () => {
    expect(resolveBlockabilityStatus("pre_request_unblockable")).toBe("cannot_block")
    expect(resolveBlockabilityStatus("server_side_unblockable")).toBe("cannot_block")
  })

  it("keeps observable-only and user-action-required observations active", () => {
    expect(resolveBlockabilityStatus("observable_only")).toBe("active")
    expect(resolveBlockabilityStatus("user_action_required")).toBe("active")
  })
})
