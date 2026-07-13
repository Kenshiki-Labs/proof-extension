import { validateTrackerDatabase } from "~core/db/validate"
import { getTrackerExplanation, type TrackerExplanation } from "~core/domain/tracker-explanation"
import type { ObserverEvent } from "~core/domain/types"

export type ObserverRemediation = {
  observerName: string
  parentCompany: string
  categoryLabels: string[]
  collects: string[]
  monetization: string[]
  futureCollectionUrl: string
  deletionUrl: string
  identityVerificationRequired: boolean
  estimatedTimeMinutes: number
  recheckIntervalDays: number
  frictionClass: string
  notes: string
  jurisdictionNotes: string
  privacyContact?: string | undefined
  explanation: TrackerExplanation
}

export function getObserverRemediation(event: ObserverEvent): ObserverRemediation | null {
  const trackerId = event.trackerId
  if (!trackerId) return null

  const { companies, remediation, trackers } = validateTrackerDatabase()
  const tracker = trackers.find((item) => item.id === trackerId)
  if (!tracker) return null

  const company = companies.find((item) => item.id === tracker.companyId)
  const remediationRecord = remediation.find((item) => item.id === tracker.remediationId)
  if (!company || !remediationRecord) return null

  return {
    observerName: company.name,
    parentCompany: company.parentCompany,
    categoryLabels: company.categoryLabels,
    collects: tracker.collects,
    monetization: tracker.monetization,
    futureCollectionUrl: remediationRecord.future_collection_url,
    deletionUrl: remediationRecord.deletion_url,
    identityVerificationRequired: remediationRecord.identity_verification_required,
    estimatedTimeMinutes: remediationRecord.estimated_time_minutes,
    recheckIntervalDays: remediationRecord.recheck_interval_days,
    frictionClass: remediationRecord.friction_class,
    notes: remediationRecord.notes,
    jurisdictionNotes: remediationRecord.jurisdiction_notes,
    privacyContact: company.privacyContact,
    explanation: getTrackerExplanation(tracker)
  }
}
