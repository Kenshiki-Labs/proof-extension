import { useMemo, useState } from "react"
import { ClipboardCopy, ExternalLink, Trash2 } from "lucide-react"

import { rankObservers, type AttentionTier } from "~core/domain/attention"
import { getObserverRemediation, type ObserverRemediation } from "~core/domain/remediation"
import type { ObserverEvent } from "~core/domain/types"
import { TYPE, UI } from "~components/system/tokens"

// The batch remediation flow: fourteen per-card decisions become one
// decision plus a checklist. Worst first (attention rank), each row shows
// the cost of acting before the click, done-state is local to the session,
// and the whole queue exports as a plain-text checklist (spec Phase 1.5).

const TIER_CHIP: Record<AttentionTier, string> = {
  red: "border-danger/60 bg-danger/10 text-danger",
  amber: "border-amber-700/60 bg-amber-700/10 text-amber-700",
  gray: "border-border bg-muted/40 text-muted-foreground"
}

type QueueItem = {
  trackerId: string
  tier: AttentionTier
  remediation: ObserverRemediation
}

function buildQueue(events: ObserverEvent[]): QueueItem[] {
  const seen = new Set<string>()
  const queue: QueueItem[] = []
  for (const item of rankObservers(events)) {
    const trackerId = item.observation.event.trackerId
    if (!trackerId || seen.has(trackerId)) continue
    seen.add(trackerId)
    const remediation = getObserverRemediation(item.observation.event)
    if (!remediation) continue
    queue.push({ trackerId, tier: item.tier, remediation })
  }
  return queue
}

function checklistText(queue: QueueItem[]): string {
  const lines = [
    "Pulse Observer — source-level cleanup checklist",
    "Blocking does not delete records these companies already hold; these links do.",
    ""
  ]
  for (const [index, item] of queue.entries()) {
    lines.push(
      `${index + 1}. ${item.remediation.observerName} (${item.remediation.parentCompany})`,
      `   Opt out:  ${item.remediation.futureCollectionUrl}`,
      `   Delete:   ${item.remediation.deletionUrl}`,
      `   Cost:     ~${item.remediation.estimatedTimeMinutes} min · ${item.remediation.identityVerificationRequired ? "ID check required" : "no ID check"} · recheck in ${item.remediation.recheckIntervalDays} days`,
      ""
    )
  }
  return lines.join("\n")
}

export default function CleanupFlow({ events }: { events: ObserverEvent[] }) {
  const queue = useMemo(() => buildQueue(events), [events])
  const [done, setDone] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  if (queue.length === 0) {
    return <p className={`${TYPE.body} mt-3`}>No source-level remediation path is known for the current observations.</p>
  }

  const remaining = queue.length - done.size

  async function copyChecklist() {
    await navigator.clipboard.writeText(checklistText(queue))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={TYPE.body}>
          {remaining === 0
            ? `All ${queue.length} worked through. Recheck intervals are in the checklist.`
            : `${queue.length} ${queue.length === 1 ? "company has" : "companies have"} a way out, worst first. ${done.size > 0 ? `${done.size} done, ${remaining} to go.` : "Work top to bottom."}`}
        </p>
        <button
          className={`${UI.segment} ${UI.segmentIdle} flex items-center gap-1.5`}
          onClick={() => copyChecklist().catch(() => undefined)}
          type="button">
          <ClipboardCopy aria-hidden className="h-3 w-3" />
          {copied ? "Copied" : "Copy checklist"}
        </button>
      </div>
      <ol className="mt-3 space-y-2">
        {queue.map((item, index) => {
          const isDone = done.has(item.trackerId)
          return (
            <li className={`${UI.subtlePanel} p-3 ${isDone ? "opacity-50" : ""}`} key={item.trackerId}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={`Mark ${item.remediation.observerName} handled`}
                  checked={isDone}
                  className="h-4 w-4 accent-current"
                  onChange={() => {
                    const next = new Set(done)
                    if (isDone) next.delete(item.trackerId)
                    else next.add(item.trackerId)
                    setDone(next)
                  }}
                  type="checkbox"
                />
                <span className={`${TYPE.label} text-signal`}>{String(index + 1).padStart(2, "0")}</span>
                <strong className="text-sm">{item.remediation.observerName}</strong>
                <span className={`rounded-full border px-2 py-0.5 text-[0.625rem] uppercase ${TIER_CHIP[item.tier]}`}>
                  {item.tier === "red" ? "no trade" : item.tier === "amber" ? "ads trade" : "site tools"}
                </span>
                <span className={TYPE.small}>
                  ≈{item.remediation.estimatedTimeMinutes} min · {item.remediation.identityVerificationRequired ? "ID check" : "no ID check"}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <a
                    className="flex items-center gap-1 rounded-full border border-emerald-700/60 bg-emerald-700/10 px-2.5 py-1 text-[0.625rem] uppercase text-emerald-700 transition-colors hover:bg-emerald-700 hover:text-background"
                    href={item.remediation.futureCollectionUrl}
                    rel="noreferrer"
                    target="_blank">
                    <ExternalLink aria-hidden className="h-3 w-3" />
                    Opt out
                  </a>
                  <a
                    className="flex items-center gap-1 rounded-full border border-danger/60 bg-danger/10 px-2.5 py-1 text-[0.625rem] uppercase text-danger transition-colors hover:bg-danger hover:text-background"
                    href={item.remediation.deletionUrl}
                    rel="noreferrer"
                    target="_blank">
                    <Trash2 aria-hidden className="h-3 w-3" />
                    Delete
                  </a>
                </span>
              </div>
            </li>
          )
        })}
      </ol>
      <p className={`${TYPE.small} mt-2`}>Done-marks live in this tab only. Copy the checklist to keep the queue.</p>
    </div>
  )
}
