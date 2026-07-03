import companies from "~core/db/companies.json"
import remediation from "~core/db/remediation.json"
import trackers from "~core/db/trackers.json"
import { CompanyDatabaseSchema, RemediationDatabaseSchema, TrackerDatabaseSchema } from "~core/contracts/schemas"
import type { TrackerRecord, TrackerSource } from "~core/contracts/schemas"

const BLOCKING_POLICY_SOURCE_FAMILIES = new Set<TrackerSource["family"]>([
  "manual_seed",
  "manual_fixture",
  "vendor_docs",
  "easyprivacy",
  "easylist",
  "first_party_evidence"
])

const SOURCE_URL_REQUIRED_FAMILIES = new Set<TrackerSource["family"]>([
  "duckduckgo_tracker_radar",
  "easyprivacy",
  "easylist"
])

function assertUniqueIds(records: Array<{ id: string }>, label: string) {
  const seen = new Set<string>()
  for (const record of records) {
    if (seen.has(record.id)) throw new Error(`Duplicate ${label} id: ${record.id}`)
    seen.add(record.id)
  }
}

function assertSafeTrackerMatch(tracker: TrackerRecord) {
  if (tracker.match.domains.length === 0 && tracker.match.paths.length > 0) {
    throw new Error(`Tracker ${tracker.id} has path rules without domains`)
  }

  for (const domain of tracker.match.domains) {
    if (domain.includes("/") || domain.startsWith("http")) {
      throw new Error(`Tracker ${tracker.id} has malformed domain ${domain}`)
    }
  }

  for (const path of tracker.match.paths) {
    if (!path.startsWith("/")) {
      throw new Error(`Tracker ${tracker.id} path must start with /: ${path}`)
    }
  }
}

function assertTrackerProvenance(tracker: TrackerRecord) {
  if (tracker.sources.length === 0) throw new Error(`Tracker ${tracker.id} has no sources`)

  if (tracker.browserAction.blockability === "network_blockable") {
    const hasBlockingPolicySource = tracker.sources.some((source) => BLOCKING_POLICY_SOURCE_FAMILIES.has(source.family))
    if (!hasBlockingPolicySource) {
      throw new Error(`Tracker ${tracker.id} is network_blockable without a blocking-policy source`)
    }
  }

  for (const source of tracker.sources) {
    if (SOURCE_URL_REQUIRED_FAMILIES.has(source.family) && !source.url) {
      throw new Error(`Tracker ${tracker.id} source ${source.family} requires url`)
    }
  }

  if (tracker.review.status === "source_backed" && tracker.sources.every((source) => source.family === "manual_seed")) {
    throw new Error(`Tracker ${tracker.id} cannot be source_backed with only manual_seed provenance`)
  }
}

function assertHighFidelityTracker(tracker: TrackerRecord) {
  if (tracker.schemaVersion < 2) return

  if (!tracker.displayName) throw new Error(`Tracker ${tracker.id} v2 requires displayName`)
  if (!tracker.observes || tracker.observes.browserVisible.length === 0) {
    throw new Error(`Tracker ${tracker.id} v2 requires browser-visible observation details`)
  }
  if (!tracker.userImpact?.plainSummary) throw new Error(`Tracker ${tracker.id} v2 requires userImpact.plainSummary`)
  if (tracker.userImpact.whyItMatters.length === 0) throw new Error(`Tracker ${tracker.id} v2 requires whyItMatters`)
  if (!tracker.userImpact.riskLevel) throw new Error(`Tracker ${tracker.id} v2 requires riskLevel`)
  if (tracker.userImpact.riskReasons.length === 0) throw new Error(`Tracker ${tracker.id} v2 requires riskReasons`)
  if (tracker.browserAction.whatBlockingChanges.length === 0) {
    throw new Error(`Tracker ${tracker.id} v2 requires whatBlockingChanges`)
  }
  if (tracker.browserAction.whatBlockingDoesNotChange.length === 0) {
    throw new Error(`Tracker ${tracker.id} v2 requires whatBlockingDoesNotChange`)
  }
}

export function validateTrackerDatabaseRecords(rawTrackers: unknown, rawCompanies: unknown, rawRemediation: unknown) {
  const parsedTrackers = TrackerDatabaseSchema.parse(rawTrackers)
  const parsedCompanies = CompanyDatabaseSchema.parse(rawCompanies)
  const parsedRemediation = RemediationDatabaseSchema.parse(rawRemediation)

  assertUniqueIds(parsedTrackers, "tracker")
  assertUniqueIds(parsedCompanies, "company")
  assertUniqueIds(parsedRemediation, "remediation")

  const companyIds = new Set(parsedCompanies.map((company) => company.id))
  const remediationIds = new Set(parsedRemediation.map((record) => record.id))

  for (const tracker of parsedTrackers) {
    if (!companyIds.has(tracker.companyId)) throw new Error(`Tracker ${tracker.id} references unknown company ${tracker.companyId}`)
    if (!remediationIds.has(tracker.remediationId)) {
      throw new Error(`Tracker ${tracker.id} references unknown remediation ${tracker.remediationId}`)
    }
    assertSafeTrackerMatch(tracker)
    assertTrackerProvenance(tracker)
    assertHighFidelityTracker(tracker)
  }

  return {
    companies: parsedCompanies,
    remediation: parsedRemediation,
    trackers: parsedTrackers
  }
}

export function validateTrackerDatabase() {
  return validateTrackerDatabaseRecords(trackers, companies, remediation)
}