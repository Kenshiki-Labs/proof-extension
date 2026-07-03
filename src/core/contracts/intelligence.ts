import { z } from "zod"

import { TrackerReviewSchema, TrackerSourceSchema } from "~core/contracts/schemas"

// Contracts for intelligence/normalized/* import artifacts. These validate
// the normalizer's output (scripts/normalize-intelligence.mjs); they are not
// runtime DB schemas. Records only reach src/core/db/* through a reviewed
// promotion that satisfies the tracker/company/remediation schemas.

export const CollectsFlagSchema = z.enum(["yes", "no", "unknown"])

export const BrokerRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  registrySources: z.array(z.string().min(1)).min(1),
  websiteUrls: z.array(z.string().min(1)),
  privacyPolicyUrls: z.array(z.string().min(1)),
  optOutUrls: z.array(z.string().min(1)),
  emails: z.array(z.string().min(1)),
  phones: z.array(z.string().min(1)),
  contacts: z.array(z.string().min(1)),
  addresses: z.array(z.string().min(1)),
  dataCategories: z.array(z.string().min(1)),
  collects: z.object({
    names: CollectsFlagSchema,
    addresses: CollectsFlagSchema,
    dateOfBirth: CollectsFlagSchema,
    placeOfBirth: CollectsFlagSchema,
    mothersMaidenName: CollectsFlagSchema,
    biometricData: CollectsFlagSchema,
    ssnOrGovernmentId: CollectsFlagSchema,
    minorsData: CollectsFlagSchema,
    reproductiveHealthData: CollectsFlagSchema,
    employmentData: CollectsFlagSchema,
    networkData: CollectsFlagSchema,
    commercialData: CollectsFlagSchema,
    otherInfo: CollectsFlagSchema
  })
})

export const DefenseDestinationRecordSchema = z.object({
  id: z.string().min(1),
  companyId: z.string().min(1),
  companyName: z.string().min(1),
  displayName: z.string().min(1),
  category: z.string().min(1),
  mode: z.enum(["reduceExposure", "respondToThreat"]),
  defenseFunction: z.string().min(1),
  actionType: z.string().min(1),
  collectionLayer: z.string().min(1),
  url: z.url().nullable(),
  phoneNumber: z.string().min(1).nullable(),
  estimatedMinutes: z.number().int().positive().nullable(),
  frictionLevel: z.enum(["low", "medium", "high"]).nullable(),
  costModel: z.string().min(1).nullable(),
  hasRemovalFee: z.boolean(),
  actorClass: z.string().min(1).nullable(),
  harmSeverity: z.string().min(1).nullable(),
  situationIds: z.array(z.string().min(1)),
  whyMatters: z.string().min(1).nullable(),
  sourceAttribution: z.string().min(1).nullable()
})

const importArtifactBase = {
  schemaVersion: z.literal(1),
  sources: z.array(TrackerSourceSchema).min(1),
  review: TrackerReviewSchema
}

export const NormalizedBrokersSchema = z.object({
  ...importArtifactBase,
  records: z.array(BrokerRecordSchema).min(1)
})

export const NormalizedDefenseDestinationsSchema = z.object({
  ...importArtifactBase,
  upstreamSchema: z.string().min(1),
  upstreamVersion: z.string().min(1).nullable(),
  records: z.array(DefenseDestinationRecordSchema).min(1)
})

const ccpaRequestFamilySchema = z.object({
  received: z.number().int().nullable(),
  compliedInWhole: z.number().int().nullable(),
  compliedInPart: z.number().int().nullable(),
  denied: z.number().int().nullable(),
  meanResponseDays: z.number().int().nullable(),
  medianResponseDays: z.number().int().nullable()
})

export const CaliforniaBrokerRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dba: z.string().min(1).nullable(),
  websiteUrl: z.string().min(1).nullable(),
  email: z.string().min(1).nullable(),
  phone: z.string().min(1).nullable(),
  address: z.string().min(1).nullable(),
  privacyRightsUrl: z.string().min(1).nullable(),
  collects: z.object({
    minorsData: CollectsFlagSchema,
    accountLogins: CollectsFlagSchema,
    governmentId: CollectsFlagSchema,
    citizenshipData: CollectsFlagSchema,
    unionMembership: CollectsFlagSchema,
    sexualOrientation: CollectsFlagSchema,
    genderIdentity: CollectsFlagSchema,
    biometricData: CollectsFlagSchema,
    preciseGeolocation: CollectsFlagSchema,
    reproductiveHealthData: CollectsFlagSchema
  }),
  sharedOrSoldTo: z.object({
    foreignActor: CollectsFlagSchema,
    federalGovernment: CollectsFlagSchema,
    stateGovernments: CollectsFlagSchema,
    lawEnforcement: CollectsFlagSchema,
    genAiDevelopers: CollectsFlagSchema
  }),
  regulatedBy: z.object({
    fcra: CollectsFlagSchema,
    glba: CollectsFlagSchema,
    iippa: CollectsFlagSchema,
    cmia: CollectsFlagSchema,
    hipaa: CollectsFlagSchema
  }),
  ccpaMetrics: z.object({
    deleteRequests: ccpaRequestFamilySchema,
    knowCollectedRequests: ccpaRequestFamilySchema,
    knowSoldRequests: ccpaRequestFamilySchema,
    optOutRequests: ccpaRequestFamilySchema,
    limitSensitiveRequests: ccpaRequestFamilySchema
  })
})

export const NormalizedCaliforniaBrokersSchema = z.object({
  ...importArtifactBase,
  records: z.array(CaliforniaBrokerRecordSchema).min(1)
})

// The SSOT identity index: which per-source records refer to the same
// real-world organization. Facts live in the per-source files; entities
// only join them.
export const EntityRecordSchema = z.object({
  id: z.string().min(1),
  canonicalName: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  domains: z.array(z.string().min(1)),
  facets: z.object({
    companyIds: z.array(z.string().min(1)),
    trackerIds: z.array(z.string().min(1)),
    broker2025Ids: z.array(z.string().min(1)),
    caRegistry2026Ids: z.array(z.string().min(1)),
    defenseDestinationIds: z.array(z.string().min(1))
  }),
  // Per-facet match confidence: how each source record joined this entity.
  // domain > name > alias in evidence strength; anchor is the facet that
  // created the entity.
  joins: z.array(
    z.object({
      key: z.string().min(1),
      method: z.enum(["anchor", "domain", "name", "alias", "adjudicated"]),
      confidence: z.number().min(0).max(1),
      confidenceLabel: z.enum(["confirmed", "high", "medium", "low"]),
      reasons: z.array(z.string().min(1)).min(1)
    })
  )
})

export const NormalizedEntitiesSchema = z.object({
  ...importArtifactBase,
  adjudication: z.object({
    path: z.string().min(1),
    records: z.number().int().nonnegative(),
    appliedRecords: z.number().int().nonnegative()
  }),
  conflictReport: z.string().min(1),
  scope: z.object({
    purpose: z.enum(["extension_runtime", "quarantined_research"]),
    rule: z.string().min(1),
    quarantinedEntityCount: z.number().int().nonnegative().optional(),
    quarantinePath: z.string().min(1).optional()
  }).optional(),
  records: z.array(EntityRecordSchema).min(1)
})

export const EntityAdjudicationRecordSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["proposed", "approved", "rejected", "superseded"]),
  action: z.enum(["merge", "split", "confirm", "reject"]),
  conflictId: z.string().min(1).nullable(),
  facetKeys: z.array(z.string().min(1)),
  targetEntityId: z.string().min(1).nullable(),
  reviewer: z.string().min(1),
  reviewed_at: z.iso.date().nullable(),
  evidence: z.array(z.string().min(1)),
  notes: z.string().min(1)
})

export const EntityAdjudicationsSchema = z.object({
  schemaVersion: z.literal(1),
  records: z.array(EntityAdjudicationRecordSchema)
})

export const EntityConflictRecordSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["domain_points_to_multiple_entities", "domain_owner_conflict", "slug_owner_conflict", "low_confidence_join", "shared_infrastructure_domain"]),
  severity: z.enum(["medium", "high"]),
  status: z.enum(["needs_review", "adjudicated"]),
  entityIds: z.array(z.string().min(1)),
  facetKeys: z.array(z.string().min(1)),
  adjudicationIds: z.array(z.string().min(1)).optional(),
  details: z.record(z.string(), z.unknown())
})

export const EntityConflictReportSchema = z.object({
  ...importArtifactBase,
  summary: z.object({
    scope: z.enum(["extension_runtime", "quarantined_research"]),
    total: z.number().int().nonnegative(),
    needsReview: z.number().int().nonnegative(),
    adjudicated: z.number().int().nonnegative(),
    manualAdjudications: z.number().int().nonnegative()
  }),
  records: z.array(EntityConflictRecordSchema)
})

export const IntelligenceSnapshotManifestSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotVersion: z.string().min(1),
  packageVersion: z.string().min(1),
  generatedAt: z.iso.date(),
  signing: z.object({
    algorithm: z.literal("HMAC-SHA256"),
    keyEnv: z.literal("INTELLIGENCE_SNAPSHOT_SIGNING_KEY"),
    status: z.enum(["signed", "unsigned_no_key"])
  }),
  artifacts: z.array(
    z.object({
      path: z.string().min(1),
      sha256: z.string().regex(/^[a-f0-9]{64}$/)
    })
  ),
  signature: z.string().regex(/^[a-f0-9]{64}$/).nullable()
})

export type BrokerRecord = z.infer<typeof BrokerRecordSchema>
export type DefenseDestinationRecord = z.infer<typeof DefenseDestinationRecordSchema>
export type CaliforniaBrokerRecord = z.infer<typeof CaliforniaBrokerRecordSchema>
export type EntityRecord = z.infer<typeof EntityRecordSchema>
export type EntityConflictRecord = z.infer<typeof EntityConflictRecordSchema>
