import { describe, expect, it } from "vitest"

import { validateTrackerDatabase } from "~core/db/validate"

import { getTrackerSupplyChainRole, groupBySupplyChainStage, SUPPLY_CHAIN_STAGES } from "./supply-chain"

describe("supply chain roles", () => {
  it("every tracker occupies exactly one stage", () => {
    for (const tracker of validateTrackerDatabase().trackers) {
      expect(getTrackerSupplyChainRole(tracker.id), tracker.id).toBeTruthy()
    }
  })

  it("pins the canonical positions from the money-flow walk", () => {
    expect(getTrackerSupplyChainRole("google-tag-manager")).toBe("mine_infrastructure")
    expect(getTrackerSupplyChainRole("segment")).toBe("concentrator")
    expect(getTrackerSupplyChainRole("liveramp")).toBe("refinery")
    expect(getTrackerSupplyChainRole("lotame")).toBe("parts_supplier")
    expect(getTrackerSupplyChainRole("the-trade-desk")).toBe("assembly")
    expect(getTrackerSupplyChainRole("magnite")).toBe("wholesale")
    expect(getTrackerSupplyChainRole("taboola")).toBe("retail_shelf")
    expect(getTrackerSupplyChainRole("google-ads")).toBe("vertically_integrated")
    expect(getTrackerSupplyChainRole("hotjar")).toBe("site_tooling")
    expect(getTrackerSupplyChainRole("unknown")).toBeNull()
  })

  it("groups observed trackers by stage in chain order, omitting empty stages", () => {
    const stages = groupBySupplyChainStage(["magnite", "google-tag-manager", "liveramp", "magnite"])
    expect(stages.map((stage) => stage.role)).toEqual(["mine_infrastructure", "refinery", "wholesale"])
    expect(stages[2]?.trackerIds).toEqual(["magnite"])
  })

  it("describes every stage in plain language", () => {
    for (const stage of SUPPLY_CHAIN_STAGES) {
      expect(stage.label.length).toBeGreaterThan(0)
      expect(stage.description).not.toMatch(/\b(DSP|SSP|CPM|RTB|DMP|CDP)\b/)
    }
  })
})
