import companies from "~core/db/companies.json"
import remediation from "~core/db/remediation.json"
import trackers from "~core/db/trackers.json"
import { CompanyDatabaseSchema, RemediationDatabaseSchema, TrackerDatabaseSchema } from "~core/contracts/schemas"

function assertUniqueIds(records: Array<{ id: string }>, label: string) {
  const seen = new Set<string>()
  for (const record of records) {
    if (seen.has(record.id)) throw new Error(`Duplicate ${label} id: ${record.id}`)
    seen.add(record.id)
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