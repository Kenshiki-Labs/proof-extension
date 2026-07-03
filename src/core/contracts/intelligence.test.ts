import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  EntityAdjudicationsSchema,
  EntityConflictReportSchema,
  IntelligenceSnapshotManifestSchema,
  NormalizedBrokersSchema,
  NormalizedCaliforniaBrokersSchema,
  NormalizedDefenseDestinationsSchema,
  NormalizedDefenseProductSurfaceSchema,
  NormalizedEntitiesSchema
} from "./intelligence"

const root = resolve(__dirname, "../../..")
const brokersRaw = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/brokers.json"), "utf8"))
const destinationsRaw = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/defense-destinations.json"), "utf8"))
const californiaRaw = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/ca-brokers-2026.json"), "utf8"))
const entitiesRaw = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/entities.json"), "utf8"))
const conflictsRaw = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/entity-conflicts.json"), "utf8"))
const quarantinedEntitiesRaw = JSON.parse(readFileSync(resolve(root, "intelligence/quarantine/research-entities.json"), "utf8"))
const quarantinedConflictsRaw = JSON.parse(readFileSync(resolve(root, "intelligence/quarantine/research-entity-conflicts.json"), "utf8"))
const adjudicationsRaw = JSON.parse(readFileSync(resolve(root, "intelligence/adjudication/entity-adjudications.json"), "utf8"))
const snapshotManifestRaw = JSON.parse(readFileSync(resolve(root, "intelligence/snapshots/2026-07-03/manifest.json"), "utf8"))

describe("normalized broker registry", () => {
  const brokers = NormalizedBrokersSchema.parse(brokersRaw)

  it("validates against the import contract with state_registry provenance", () => {
    expect(brokers.sources[0]?.family).toBe("state_registry")
    expect(brokers.review.status).toBe("source_backed")
    expect(brokers.records.length).toBe(750)
  })

  it("has unique, sorted broker ids", () => {
    const ids = brokers.records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)))
  })

  it("merges multi-state filings into one record per broker", () => {
    const multiState = brokers.records.filter((record) => record.registrySources.length > 1)
    expect(multiState.length).toBeGreaterThan(100)
  })

  it("keeps opt-out and contact coverage worth importing", () => {
    expect(brokers.records.filter((record) => record.optOutUrls.length > 0).length).toBeGreaterThan(500)
    expect(brokers.records.filter((record) => record.emails.length > 0).length).toBeGreaterThan(600)
  })

  it("pins the transform for a known multi-state broker", () => {
    const broker = brokers.records.find((record) => record.name === "01Advertising Inc.")
    expect(broker).toMatchSnapshot()
  })
})

describe("normalized defense destinations", () => {
  const destinations = NormalizedDefenseDestinationsSchema.parse(destinationsRaw)

  it("validates against the import contract with kenshiki_defense_registry provenance", () => {
    expect(destinations.sources[0]?.family).toBe("kenshiki_defense_registry")
    expect(destinations.upstreamSchema).toBe("defense-registry.v3-harm")
    expect(destinations.records.length).toBe(105)
  })

  it("has unique, sorted destination ids", () => {
    const ids = destinations.records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)))
  })

  it("separates defenders from predators via actor class", () => {
    const classes = new Set(destinations.records.map((record) => record.actorClass))
    expect(classes).toContain("people_search_broker")
    expect(classes).toContain("regulated_cra")
    expect(classes).toContain("privacy_tool")
  })

  it("pins the transform for a known destination", () => {
    const destination = destinations.records.find((record) => record.id === "equifax_freeze")
    expect(destination).toMatchSnapshot()
  })
})

describe("normalized California 2026 registry", () => {
  const california = NormalizedCaliforniaBrokersSchema.parse(californiaRaw)

  it("validates against the import contract with state_registry provenance", () => {
    expect(california.sources[0]?.family).toBe("state_registry")
    expect(california.records.length).toBe(581)
  })

  it("has unique, sorted broker ids", () => {
    const ids = california.records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)))
  })

  it("carries the disclosures no other source has", () => {
    const genAiSellers = california.records.filter((record) => record.sharedOrSoldTo.genAiDevelopers === "yes")
    const lawEnforcementSellers = california.records.filter((record) => record.sharedOrSoldTo.lawEnforcement === "yes")
    const withDeleteMetrics = california.records.filter((record) => (record.ccpaMetrics.deleteRequests.received ?? 0) > 0)
    expect(genAiSellers.length).toBeGreaterThan(0)
    expect(lawEnforcementSellers.length).toBeGreaterThan(0)
    expect(withDeleteMetrics.length).toBeGreaterThan(50)
  })

  it("pins the transform for a known broker", () => {
    expect(california.records.find((record) => record.name === "01Advertising Inc.")).toMatchSnapshot()
  })
})

describe("entity SSOT index", () => {
  const entities = NormalizedEntitiesSchema.parse(entitiesRaw)

  it("has unique, sorted entity ids and unique domain ownership", () => {
    const ids = entities.records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)))

    const domains = entities.records.flatMap((record) => record.domains)
    expect(new Set(domains).size).toBe(domains.length)
  })

  it("is scoped to entities reachable from runtime tracker/company observations", () => {
    expect(entities.scope?.purpose).toBe("extension_runtime")
    expect(entities.records.length).toBeLessThan(100)
    for (const entity of entities.records) {
      expect(entity.facets.companyIds.length + entity.facets.trackerIds.length).toBeGreaterThan(0)
    }
  })

  it("anchors every runtime company exactly once so observers can reach broker intelligence", () => {
    const companyCount = JSON.parse(readFileSync(resolve(root, "src/core/db/companies.json"), "utf8")).length
    const companyIds = entities.records.flatMap((record) => record.facets.companyIds)
    // Every runtime company in exactly one entity — though one entity may hold
    // several (Google Analytics + Tag Manager resolve to one Alphabet entity).
    expect(companyIds.length).toBe(companyCount)
    expect(new Set(companyIds).size).toBe(companyCount)
    const anchored = entities.records.filter((record) => record.facets.companyIds.length > 0)
    for (const entity of anchored) expect(entity.facets.trackerIds.length).toBeGreaterThan(0)
  })

  it("references only records that exist in the per-source files", () => {
    const broker2025 = new Set(NormalizedBrokersSchema.parse(brokersRaw).records.map((record) => record.id))
    const ca2026 = new Set(NormalizedCaliforniaBrokersSchema.parse(californiaRaw).records.map((record) => record.id))
    const defense = new Set(NormalizedDefenseDestinationsSchema.parse(destinationsRaw).records.map((record) => record.id))
    for (const entity of entities.records) {
      for (const id of entity.facets.broker2025Ids) expect(broker2025).toContain(id)
      for (const id of entity.facets.caRegistry2026Ids) expect(ca2026).toContain(id)
      for (const id of entity.facets.defenseDestinationIds) expect(defense).toContain(id)
    }
  })

  it("records confidence, reason codes, and artifact links for every facet join", () => {
    expect(entities.sources[0]?.family).toBe("kenshiki_entity_index")
    expect(entities.conflictReport).toBe("intelligence/normalized/entity-conflicts.json")
    expect(entities.adjudication.path).toBe("intelligence/adjudication/entity-adjudications.json")
    for (const entity of entities.records) {
      expect(entity.joins.length).toBeGreaterThan(0)
      for (const join of entity.joins) {
        expect(join.confidence).toBeGreaterThanOrEqual(0)
        expect(join.confidence).toBeLessThanOrEqual(1)
        expect(join.reasons.length).toBeGreaterThan(0)
      }
    }
  })
})

describe("entity conflict and adjudication artifacts", () => {
  const conflicts = EntityConflictReportSchema.parse(conflictsRaw)
  const quarantinedConflicts = EntityConflictReportSchema.parse(quarantinedConflictsRaw)
  const adjudications = EntityAdjudicationsSchema.parse(adjudicationsRaw)

  it("validates generated conflict reporting with source provenance", () => {
    expect(conflicts.sources[0]?.family).toBe("kenshiki_entity_index")
    expect(conflicts.summary.scope).toBe("extension_runtime")
    expect(conflicts.summary.total).toBe(conflicts.records.length)
    expect(conflicts.summary.manualAdjudications).toBe(adjudications.records.length)
    expect(quarantinedConflicts.summary.scope).toBe("quarantined_research")
  })

  it("keeps the manual adjudication ledger sorted and unique when populated", () => {
    const ids = adjudications.records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)))
  })
})

describe("quarantined research entity index", () => {
  const quarantined = NormalizedEntitiesSchema.parse(quarantinedEntitiesRaw)

  it("keeps broker-only and defense-only records out of the extension SSOT", () => {
    expect(quarantined.scope?.purpose).toBe("quarantined_research")
    expect(quarantined.records.length).toBeGreaterThan(700)
    for (const entity of quarantined.records) {
      expect(entity.facets.companyIds.length + entity.facets.trackerIds.length).toBe(0)
    }
  })

  it("preserves cross-year registry joins for audit without making them runtime SSOT", () => {
    const crossYear = quarantined.records.filter(
      (record) => record.facets.broker2025Ids.length > 0 && record.facets.caRegistry2026Ids.length > 0
    )
    expect(crossYear.length).toBeGreaterThan(400)
  })
})

describe("versioned intelligence snapshot manifest", () => {
  const manifest = IntelligenceSnapshotManifestSchema.parse(snapshotManifestRaw)

  it("pins every normalized intelligence artifact by hash", () => {
    expect(manifest.snapshotVersion).toBe("2026-07-03")
    expect(manifest.artifacts.map((artifact) => artifact.path)).toEqual([...manifest.artifacts.map((artifact) => artifact.path)].sort())
    expect(manifest.artifacts.some((artifact) => artifact.path === "intelligence/normalized/entities.json")).toBe(true)
    expect(manifest.artifacts.some((artifact) => artifact.path === "intelligence/normalized/entity-conflicts.json")).toBe(true)
    expect(manifest.artifacts.some((artifact) => artifact.path === "intelligence/quarantine/research-entities.json")).toBe(true)
    expect(manifest.artifacts.some((artifact) => artifact.path === "intelligence/adjudication/entity-adjudications.json")).toBe(true)
  })
})

describe("entity ID stability ledger", () => {
  const ledger = JSON.parse(readFileSync(resolve(root, "intelligence/entity-ledger.json"), "utf8"))
  const entities = NormalizedEntitiesSchema.parse(entitiesRaw)
  const quarantined = NormalizedEntitiesSchema.parse(quarantinedEntitiesRaw)

  it("assigns every facet of every entity to that entity's id", () => {
    const map = ledger.facetKeyToEntityId as Record<string, string>
    for (const entity of [...entities.records, ...quarantined.records]) {
      const keys = [
        ...entity.facets.companyIds.map((id) => `company:${id}`),
        ...entity.facets.broker2025Ids.map((id) => `broker2025:${id}`),
        ...entity.facets.caRegistry2026Ids.map((id) => `ca2026:${id}`),
        ...entity.facets.defenseDestinationIds.map((id) => `defense:${id}`)
      ]
      for (const key of keys) expect(map[key], key).toBe(entity.id)
    }
  })

  it("contains no ids that point at nonexistent entities", () => {
    const ids = new Set([...entities.records, ...quarantined.records].map((record) => record.id))
    for (const id of Object.values(ledger.facetKeyToEntityId as Record<string, string>)) {
      expect(ids).toContain(id)
    }
  })
})

describe("defense product surface (AI-generated, SSOT-governed)", () => {
  const surfaceRaw = JSON.parse(readFileSync(resolve(root, "intelligence/normalized/defense-product-surface.json"), "utf8"))

  it("validates the full surface with kenshiki_defense_registry provenance", () => {
    const surface = NormalizedDefenseProductSurfaceSchema.parse(surfaceRaw)
    expect(surface.sources[0]?.family).toBe("kenshiki_defense_registry")
    expect(Object.keys(surface.destinations).length).toBe(105)
    expect(surface.routing.destinationOrder.length).toBe(105)
  })

  it("keeps AI guardrails attached to destinations", () => {
    const surface = NormalizedDefenseProductSurfaceSchema.parse(surfaceRaw)
    const freeze = surface.destinations["equifax_freeze"]
    expect(freeze?.aiGuidance?.disallowedModelActions).toContain("provide_legal_advice")
    const guarded = Object.values(surface.destinations).filter((destination) => destination.aiGuidance)
    expect(guarded.length).toBeGreaterThan(100)
  })

  it("carries every copy block the app renders", () => {
    const surface = NormalizedDefenseProductSurfaceSchema.parse(surfaceRaw)
    for (const block of ["ui", "modes", "categories", "renderer", "fields", "statuses"] as const) {
      expect(Object.keys(surface.copy[block]).length).toBeGreaterThan(0)
    }
  })
})
