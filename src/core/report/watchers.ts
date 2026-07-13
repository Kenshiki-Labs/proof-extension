import { shimForTrackerId } from "~core/db/shims"
import { rankObservers, type AttentionTier } from "~core/domain/attention"
import { blockingGuidance } from "~core/domain/blocking-policy"
import { FUNCTIONAL_CATEGORY_LABELS, getFunctionalCategory, type FunctionalCategory } from "~core/domain/functional-category"
import { countWatchingObservers } from "~core/domain/observer-counts"
import { getObserverRemediation } from "~core/domain/remediation"
import type { ObserverEvent } from "~core/domain/types"
import { buildUnclassifiedGraphEdges, formatUsdRange, getTrackerValuation } from "~core/domain/valuation"
import { observerName } from "~core/report/display"

// The one watcher-list model both product surfaces render (popup top-N,
// report act 3 groups). Popup and report drifting apart historically came
// from each surface deriving its own presentation of "a watcher"; this
// module is the single derivation, and the components stay dumb.
//
// Congruence rule (docs/surface-contract.md): the popup's "+N more" must
// equal the watching headline minus the rows shown. That arithmetic lives
// HERE, computed from the same countWatchingObservers the headline uses —
// never in a component.

export type WatcherRow = {
  key: string
  // Human name for named trackers (remediation displayName when we have
  // one), registrable host for not-yet-classified parties.
  name: string
  category: FunctionalCategory
  categoryLabel: string
  tier: AttentionTier
  observations: number
  trackerId?: string | undefined
  canBlock: boolean
  // A page-safe shim resource ships for this tracker (core/db/shims.ts):
  // the UI may offer mitigation even where blocking is too breakage-prone.
  canShim: boolean
  // The invoice (contract §Popup #2): what this watcher extracts per year
  // ("$420–$500/yr to them") or what the site pays it ("site pays $x/yr").
  // Null for unpriced/unclassified watchers — an absent figure is honest,
  // an invented one is not. This is the product's differentiator; a watcher
  // list without the money is any blocker's list.
  valueLabel: string | null
}

function watcherValueLabel(trackerId: string | undefined): string | null {
  const value = getTrackerValuation(trackerId)
  if (!value || value.annual.high_usd <= 0) return null
  const range = formatUsdRange(value.annual.low_usd, value.annual.high_usd)
  return value.valueType === "revenue" ? `${range}/yr to them` : `site pays ${range}/yr`
}

export type WatcherListModel = {
  rows: WatcherRow[]
  moreCount: number
  totalWatching: number
}

// Every distinct watching party as a row: named observers first in attention
// order (tier dominates, worst first), then not-yet-classified parties by
// contact volume. Mirrors isThirdPartyObserverEvent's filter (active,
// non-first-party, page activity) so the row set is exactly the party set
// the "Watching" headline counts.
export function buildWatcherRows(events: ObserverEvent[], origin: string): WatcherRow[] {
  const rows: WatcherRow[] = []
  const seen = new Set<string>()

  for (const ranked of rankObservers(events)) {
    const event = ranked.observation.event
    if (event.status !== "active" || event.firstParty) continue
    const partyId = event.companyId ?? event.trackerId
    if (!partyId || seen.has(`named:${partyId}`)) continue
    seen.add(`named:${partyId}`)

    const guidance = blockingGuidance(event.trackerId)
    rows.push({
      key: `named:${partyId}`,
      name: getObserverRemediation(event)?.observerName ?? observerName(event),
      category: getFunctionalCategory(event.trackerId),
      categoryLabel: FUNCTIONAL_CATEGORY_LABELS[getFunctionalCategory(event.trackerId)],
      tier: ranked.tier,
      observations: ranked.observation.count,
      trackerId: event.trackerId,
      canBlock: event.blockability === "network_blockable" && Boolean(event.trackerId) && guidance.offerBlocking,
      canShim: Boolean(shimForTrackerId(event.trackerId)),
      valueLabel: watcherValueLabel(event.trackerId)
    })
  }

  const unclassified = buildUnclassifiedGraphEdges(events, origin).sort(
    (left, right) => right.observations - left.observations || left.host.localeCompare(right.host)
  )
  for (const edge of unclassified) {
    rows.push({
      key: `site:${edge.host}`,
      name: edge.host,
      category: "unidentified",
      categoryLabel: FUNCTIONAL_CATEGORY_LABELS.unidentified,
      tier: "gray",
      observations: edge.observations,
      canBlock: false,
      canShim: false,
      valueLabel: null
    })
  }

  return rows
}

export function buildWatcherListModel(events: ObserverEvent[], origin: string, limit = 5): WatcherListModel {
  const allRows = buildWatcherRows(events, origin)
  const rows = allRows.slice(0, limit)
  const totalWatching = countWatchingObservers(events)
  return {
    rows,
    // Derived from the headline count, not from allRows.length — if the two
    // ever disagree, the tests below catch the drift instead of the UI
    // silently showing a wrong "+N more".
    moreCount: Math.max(0, totalWatching - rows.length),
    totalWatching
  }
}

// Report act 3: the full list, grouped by functional category, group order
// by size (matches functionalCategoryBreakdown's ordering), worst-first
// within each group (rows arrive tier-ordered from buildWatcherRows).
export type WatcherGroup = {
  category: FunctionalCategory
  label: string
  rows: WatcherRow[]
}

export function buildWatcherGroups(events: ObserverEvent[], origin: string): WatcherGroup[] {
  const byCategory = new Map<FunctionalCategory, WatcherRow[]>()
  for (const row of buildWatcherRows(events, origin)) {
    const group = byCategory.get(row.category) ?? []
    group.push(row)
    byCategory.set(row.category, group)
  }

  return [...byCategory.entries()]
    .map(([category, rows]) => ({ category, label: FUNCTIONAL_CATEGORY_LABELS[category], rows }))
    .sort((left, right) => right.rows.length - left.rows.length || left.label.localeCompare(right.label))
}
