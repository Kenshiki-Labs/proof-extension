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
      method: z.enum(["anchor", "domain", "name", "alias"])
    })
  )
})

export const NormalizedEntitiesSchema = z.object({
  ...importArtifactBase,
  records: z.array(EntityRecordSchema).min(1)
})

export type BrokerRecord = z.infer<typeof BrokerRecordSchema>
export type DefenseDestinationRecord = z.infer<typeof DefenseDestinationRecordSchema>
export type CaliforniaBrokerRecord = z.infer<typeof CaliforniaBrokerRecordSchema>
export type EntityRecord = z.infer<typeof EntityRecordSchema>
