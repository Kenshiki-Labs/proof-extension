import { useState } from "react"

import type { SiteSummary, UserSettings } from "~core/domain/types"
import type { VisitFrequency } from "~core/domain/visit-frequency"
import type { ReportModel } from "~hooks/useReportModel"
import CleanupFlow from "~components/CleanupFlow"
import LocationReveal from "~components/LocationReveal"
import { NarrowingReportSection } from "~components/NarrowingPanel"
import VerdictBanner from "~components/VerdictBanner"
import VisitFrequencyAsk from "~components/VisitFrequencyAsk"
import Button from "~components/system/Button"
import Disclosure from "~components/system/Disclosure"
import { TYPE, UI } from "~components/system/tokens"
import TrackerGraph from "~components/value/TrackerGraph"
import WatcherList from "~components/watchers/WatcherList"

import AuditBrief from "~components/report/AuditBrief"
import { AtomicSignalMatrix, ExposureScanSection, LocalPageSignalsSection } from "~components/report/EvidenceAppendix"
import EvidenceTimeline from "~components/report/EvidenceTimeline"
import ObservationTable from "~components/report/ObservationTable"
import RemediationPanel from "~components/report/RemediationPanel"
import { SectionTitle } from "~components/report/shared"
import ValuationSection from "~components/report/ValuationSection"

export default function EvidenceView({
  model,
  onAnswerVisitFrequency,
  onOpenValueLedger,
  onToggleBlocking,
  settings,
  summary
}: {
  model: ReportModel
  onAnswerVisitFrequency: (frequency: VisitFrequency) => void
  onOpenValueLedger: () => void
  onToggleBlocking: (trackerId: string, blocked: boolean) => void
  settings: UserSettings
  summary: SiteSummary
}) {
  // "network" first: the graph is the picture users should see before the
  // supporting tables — see the report-tab story-arc discussion (verdict ->
  // picture -> receipts -> action).
  const [lens, setLens] = useState<"actors" | "money" | "network" | "timeline">("network")
  const {
    allObservations,
    atomicSignalRows,
    categoryBreakdown,
    exposureEvents,
    localPageSignals,
    localStateObservations,
    narrowingModel,
    observations,
    observedRollup,
    siteDomain,
    tabEdges,
    unclassifiedTabEdges,
    watcherGroups
  } = model

  return (
    <>
      <AuditBrief
        allObservations={allObservations}
        exposureEvents={exposureEvents}
        localStateObservations={localStateObservations}
        summary={summary}
      />
      <VerdictBanner summary={summary} />
      <VisitFrequencyAsk
        annualHighUsd={observedRollup.annualRevenueHighUsd}
        annualLowUsd={observedRollup.annualRevenueLowUsd}
        domain={siteDomain}
        frequency={siteDomain ? (settings.siteVisitFrequency[siteDomain] ?? null) : null}
        onAnswer={onAnswerVisitFrequency}
        revenueTrackerCount={observedRollup.revenueTrackerCount}
      />
      {narrowingModel.steps.length > 0 ? (
        <div className="mt-6">
          <LocationReveal watching={narrowingModel.watching} />
        </div>
      ) : null}
      <NarrowingReportSection model={narrowingModel} />

      <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle number="02" title="Who was here — the picture" />
          <div className="flex flex-wrap gap-1">
            {(
              [
                { label: "Network", value: "network" },
                { label: "Actors", value: "actors" },
                { label: "Money", value: "money" },
                { label: "Timeline", value: "timeline" }
              ] as const
            ).map((item) => (
              <button
                className={`${UI.segment} ${lens === item.value ? UI.segmentActive : UI.segmentIdle}`}
                key={item.value}
                onClick={() => setLens(item.value)}
                type="button">
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {categoryBreakdown.length > 0 ? (
          <ul className={`${TYPE.small} mt-3 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground`}>
            {categoryBreakdown.map((entry) => (
              <li key={entry.category}>
                {entry.label} <span className="tabular-nums">{entry.count}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {lens === "network" ? (
          tabEdges.length > 0 || unclassifiedTabEdges.length > 0 ? (
            <div className="mt-4">
              <p className={`${TYPE.small}`}>
                Every third party on this page, named or not — gray nodes are observed but not yet in our tracker database. Switch to "Who makes what" to size named ones by estimated annual value.
              </p>
              <div className={`mt-2 ${UI.subtlePanel} p-4`}>
                <TrackerGraph edges={tabEdges} unclassifiedEdges={unclassifiedTabEdges} />
              </div>
            </div>
          ) : (
            <p className={`${TYPE.body} mt-4`}>No third-party connections were observed on this page yet.</p>
          )
        ) : null}
        {lens === "actors" ? (
          <ObservationTable blockedTrackerIds={settings.blockedTrackerIds} observations={observations} onToggleBlocking={onToggleBlocking} />
        ) : null}
        {lens === "money" ? <ValuationSection embedded events={summary.events} /> : null}
        {lens === "timeline" ? <EvidenceTimeline embedded events={summary.events} /> : null}
      </section>

      {/* Act 3 (docs/surface-contract.md): the full watcher list grouped
          by functional category, worst-first within groups, with every
          action inline — quick cleanup at the top, per-watcher opt-out
          and deletion detail behind the disclosure. */}
      <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
        <SectionTitle number="03" title="Who is watching — and what you can do" />
        <div className="mt-3">
          <CleanupFlow events={summary.events} />
        </div>
        {watcherGroups.map((group) => (
          <div className="mt-4" key={group.category}>
            <h3 className={TYPE.label}>
              {group.label} <span className="tabular-nums">{group.rows.length}</span>
            </h3>
            <WatcherList
              blockedTrackerIds={settings.blockedTrackerIds}
              model={{ rows: group.rows, moreCount: 0, totalWatching: group.rows.length }}
              onToggleBlocking={onToggleBlocking}
            />
          </div>
        ))}
        {watcherGroups.length === 0 ? <p className={`${TYPE.body} mt-3`}>No watchers on this page yet.</p> : null}
        <Disclosure className="mt-5" labelStyle="label" summary="Stop at source — opt-outs and deletion, per watcher">
          <RemediationPanel observations={observations} />
        </Disclosure>
      </section>

      <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
        <SectionTitle number="04" title="The money" />
        <ValuationSection embedded events={summary.events} />
        <div className="mt-4">
          <Button onClick={onOpenValueLedger} variant="secondary">Open the full value ledger</Button>
        </div>
      </section>

      <Disclosure className="mt-6" labelStyle="label" summary="Appendix — full evidence for auditors">
        <section className={`mt-4 ${UI.panel} ${UI.reportInset}`}>
          <SectionTitle number="05" title="All observed activity" />
          <p className={`${TYPE.small} mt-2`}>
            Grouped rows from the page's full activity stream — named watchers, site tools, not-yet-classified hosts, and storage/cache surfaces.
          </p>
          <ObservationTable blockedTrackerIds={settings.blockedTrackerIds} observations={allObservations} onToggleBlocking={onToggleBlocking} />
        </section>
        <LocalPageSignalsSection observations={localPageSignals} />
        <ExposureScanSection events={exposureEvents} />
        <AtomicSignalMatrix rows={atomicSignalRows} />
      </Disclosure>
    </>
  )
}
