import { CompanyDatabaseSchema, RemediationDatabaseSchema, TrackerDatabaseSchema } from "~core/contracts/schemas"
import type { TrackerRecord, TrackerSource } from "~core/contracts/schemas"
import companies from "~core/db/companies.json"
import remediation from "~core/db/remediation.json"
import trackers from "~core/db/trackers.json"

const BLOCKING_POLICY_SOURCE_FAMILIES = new Set<TrackerSource["family"]>([
  "manual_seed",
  "manual_fixture",
  "vendor_docs",
  "easyprivacy",
  "easylist",
  "first_party_evidence"
])

const SOURCE_URL_REQUIRED_FAMILIES = new Set<TrackerSource["family"]>(["duckduckgo_tracker_radar", "easyprivacy", "easylist"])

const TRACKER_CLAIM_SOURCE_FAMILIES = new Set<TrackerSource["family"]>([
  "manual_fixture",
  "vendor_docs",
  "easyprivacy",
  "easylist",
  "duckduckgo_tracker_radar",
  "first_party_evidence"
])

const FORBIDDEN_REASSURANCE_PATTERN = /\b(safe|protected|anonymous|anonymized|guarantee|guaranteed|private|secure)\b/i

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

  if (tracker.review.status === "source_backed" && !tracker.sources.some((source) => TRACKER_CLAIM_SOURCE_FAMILIES.has(source.family))) {
    throw new Error(`Tracker ${tracker.id} cannot be source_backed without tracker-claim provenance`)
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

function assertTrackerValuation(tracker: TrackerRecord) {
  const value = tracker.perPersonValue
  const expectedDollars = value.perVisit.microdollars / 1_000_000
  if (Math.abs(value.perVisit.dollars - expectedDollars) > 1e-12) {
    throw new Error(`Tracker ${tracker.id} has inconsistent per-visit valuation math`)
  }

  const expectedMidpoint = (value.annual.low_usd + value.annual.high_usd) / 2
  if (value.annual.high_usd < value.annual.low_usd || Math.abs(value.annual.midpoint_usd - expectedMidpoint) > 1e-9) {
    throw new Error(`Tracker ${tracker.id} has inconsistent annual valuation range`)
  }

  if (value.valueType === "cost" && value.monetizationFlow !== "operator_saas") {
    throw new Error(`Tracker ${tracker.id} cost valuation must use operator_saas flow`)
  }

  if (value.valueType === "revenue" && value.monetizationFlow === "operator_saas") {
    throw new Error(`Tracker ${tracker.id} revenue valuation cannot use operator_saas flow`)
  }

  if (value.confidence === "sourced" && /vendor pricing|vendor docs|baseline|estimated/i.test(value.sourceNote)) {
    throw new Error(`Tracker ${tracker.id} sourced valuation has generic sourceNote`)
  }
}

// The blocking-policy gate (src/core/domain/blocking-policy.ts) never offers
// or installs a block rule for a high-breakage tracker. A record that is both
// high-breakage and network_blockable therefore claims an in-product
// capability the product deliberately never exercises — the honest class for
// those records is user_action_required (source-level remediation).
function assertBreakageGateConsistency(tracker: TrackerRecord) {
  if (tracker.browserAction.siteBreakage.risk === "high" && tracker.browserAction.blockability === "network_blockable") {
    throw new Error(
      `Tracker ${tracker.id} is high-breakage (never offered blocking) but classified network_blockable; use user_action_required`
    )
  }
}

// matchTrackerRequest returns every record whose domains match a hostname, and
// the background records one event per match — two records claiming the same
// hostname space means one request double-counts as two observations (proven
// by google-analytics claiming www.googletagmanager.com alongside the
// google-tag-manager record). Domain spaces must stay disjoint across records.
function assertDisjointDomainSpace(trackers: TrackerRecord[]) {
  for (const tracker of trackers) {
    for (const other of trackers) {
      if (other.id === tracker.id) continue
      for (const domain of tracker.match.domains) {
        const collision = other.match.domains.find((otherDomain) => domain === otherDomain || domain.endsWith(`.${otherDomain}`))
        if (collision) {
          throw new Error(
            `Tracker ${tracker.id} domain ${domain} overlaps tracker ${other.id} domain ${collision}; one request would match both records`
          )
        }
      }
    }
  }
}

function assertBlockingLimitLanguage(tracker: TrackerRecord) {
  if (tracker.schemaVersion < 2) return
  if (tracker.browserAction.blockability !== "network_blockable" && tracker.browserAction.blockability !== "user_action_required") return

  const limits = tracker.browserAction.whatBlockingDoesNotChange.join(" ")
  if (!/does not delete/i.test(limits)) {
    throw new Error(`Tracker ${tracker.id} blocking limits must state that blocking does not delete prior records`)
  }
}

function assertNoReassuranceLanguage(tracker: TrackerRecord) {
  const statements = [
    tracker.userImpact?.plainSummary,
    ...(tracker.userImpact?.whyItMatters ?? []),
    ...(tracker.browserAction.whatBlockingChanges ?? []),
    ...(tracker.browserAction.whatBlockingDoesNotChange ?? [])
  ].filter((statement): statement is string => typeof statement === "string" && statement.length > 0)

  const match = statements.find((statement) => FORBIDDEN_REASSURANCE_PATTERN.test(statement))
  if (match) throw new Error(`Tracker ${tracker.id} uses forbidden reassurance language: ${match}`)
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
    assertTrackerValuation(tracker)
    assertBreakageGateConsistency(tracker)
    assertBlockingLimitLanguage(tracker)
    assertNoReassuranceLanguage(tracker)
  }

  assertDisjointDomainSpace(parsedTrackers)

  return {
    companies: parsedCompanies,
    remediation: parsedRemediation,
    trackers: parsedTrackers
  }
}

// The bundled database is immutable for the lifetime of the process, but this
// is called from nine sites including every settings sync — memoize so the
// full zod parse and the O(n²) domain-disjointness sweep run once, not per
// call, as the tracker DB grows toward EasyPrivacy scale.
let validatedBundledDatabase: ReturnType<typeof validateTrackerDatabaseRecords> | null = null

export function validateTrackerDatabase() {
  validatedBundledDatabase ??= validateTrackerDatabaseRecords(trackers, companies, remediation)
  return validatedBundledDatabase
}
