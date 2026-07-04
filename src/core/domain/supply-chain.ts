import { validateTrackerDatabase } from "~core/db/validate"
import type { TrackerRecord } from "~core/contracts/schemas"

// The ad-money supply chain, from raw behavioral events to the ad you see.
// Stages are ordered by position in the money flow; the plain-language
// description explains each stage without requiring the reader to know any
// ad-tech vocabulary. site_tooling sits outside the ad-money rail entirely
// (the site pays it); vertically_integrated companies own every stage.

export type SupplyChainRole = TrackerRecord["supplyChainRole"]

export const SUPPLY_CHAIN_STAGES: Array<{ role: SupplyChainRole; label: string; description: string }> = [
  {
    role: "mine_infrastructure",
    label: "The mineshaft",
    description: "Extracts nothing itself — it lets many other trackers tap the same site cheaply."
  },
  {
    role: "concentrator",
    label: "The concentrator",
    description: "Cleans and organizes raw behavioral events, then pipes them to other tools the site chose."
  },
  {
    role: "refinery",
    label: "The refinery",
    description: "Turns raw events into a persistent profile of you — where most of the value is added."
  },
  {
    role: "parts_supplier",
    label: "The parts supplier",
    description: "Packages profiles into audience segments — standardized parts sold to advertisers."
  },
  {
    role: "assembly",
    label: "The assembly line",
    description: "Buys the right to show you one ad, assembled in the milliseconds before the page paints."
  },
  {
    role: "wholesale",
    label: "The wholesaler",
    description: "Auctions the site's ad slots in bulk. Nobody here cares about any single impression."
  },
  {
    role: "retail_shelf",
    label: "The impulse rack",
    description: "Fills the 'around the web' slots at the bottom of articles — the lowest-value shelf."
  },
  {
    role: "vertically_integrated",
    label: "Owns every stage",
    description: "Mine, refinery, parts, assembly, and shelf in one company — margin captured at each step."
  },
  {
    role: "site_tooling",
    label: "Outside the ad rail",
    description: "The site pays for these tools. Your behavior is the input, not the product being sold."
  }
]

export const SUPPLY_CHAIN_LABELS: Record<SupplyChainRole, string> = Object.fromEntries(
  SUPPLY_CHAIN_STAGES.map((stage) => [stage.role, stage.label])
) as Record<SupplyChainRole, string>

let cachedRoles: Map<string, SupplyChainRole> | null = null

function rolesByTrackerId(): Map<string, SupplyChainRole> {
  if (!cachedRoles) {
    cachedRoles = new Map(validateTrackerDatabase().trackers.map((tracker) => [tracker.id, tracker.supplyChainRole]))
  }
  return cachedRoles
}

export function getTrackerSupplyChainRole(trackerId: string | undefined): SupplyChainRole | null {
  if (!trackerId) return null
  return rolesByTrackerId().get(trackerId) ?? null
}

// Group observed tracker ids by stage, preserving chain order. Stages with
// no observed trackers are omitted — the map shows the chain that actually
// ran on the user's browsing, not the theoretical one.
export function groupBySupplyChainStage(trackerIds: string[]): Array<{ role: SupplyChainRole; label: string; description: string; trackerIds: string[] }> {
  const byRole = new Map<SupplyChainRole, string[]>()
  for (const trackerId of [...new Set(trackerIds)].sort()) {
    const role = getTrackerSupplyChainRole(trackerId)
    if (!role) continue
    byRole.set(role, [...(byRole.get(role) ?? []), trackerId])
  }
  return SUPPLY_CHAIN_STAGES.filter((stage) => byRole.has(stage.role)).map((stage) => ({
    ...stage,
    trackerIds: byRole.get(stage.role) ?? []
  }))
}
