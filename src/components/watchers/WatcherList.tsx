import CategoryChip from "~components/watchers/CategoryChip"
import { TYPE, UI } from "~components/system/tokens"
import type { AttentionTier } from "~core/domain/attention"
import type { WatcherListModel, WatcherRow } from "~core/report/watchers"

// The one renderer of "a watcher" for both product surfaces (popup top-N,
// report act 3 groups). All selection, ranking, naming, and the "+N more"
// arithmetic happen in core/report/watchers.ts — this component only paints
// the model it is handed.

// Same palette as the verdict tiers and the graph: red = no trade, amber =
// ads trade, gray = tooling/unattributed.
const TIER_DOT: Record<AttentionTier, string> = {
  red: "bg-danger",
  amber: "bg-amber-700",
  gray: "bg-muted-foreground"
}

function WatcherRowView({
  row,
  blockedTrackerIds,
  onToggleBlocking
}: {
  row: WatcherRow
  blockedTrackerIds: string[]
  onToggleBlocking: (trackerId: string, blocked: boolean) => void
}) {
  const isBlocked = Boolean(row.trackerId) && blockedTrackerIds.includes(row.trackerId as string)

  return (
    // Deterministic single-line row: the name is the only shrinkable part.
    // flex-wrap here made rows zig-zag (a long chip pushed Block to a second
    // line on some rows, not others) — on a glance surface every row must
    // have the same shape or the list reads as broken.
    <li className={`${UI.subtlePanel} flex items-center gap-2 p-2.5`}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${TIER_DOT[row.tier]}`} />
        <strong className="truncate text-sm">{row.name}</strong>
        <span className="shrink-0">
          <CategoryChip category={row.category} />
        </span>
        {row.observations > 1 ? <span className={`${TYPE.small} shrink-0 tabular-nums`}>× {row.observations}</span> : null}
      </div>
      {row.valueLabel ? <span className={`${TYPE.small} shrink-0 whitespace-nowrap tabular-nums`}>{row.valueLabel}</span> : null}
      {row.canBlock && row.trackerId ? (
        <button
          type="button"
          onClick={() => onToggleBlocking(row.trackerId as string, !isBlocked)}
          title={isBlocked ? "Unblock this watcher's network requests" : "Block this watcher's network requests"}
          className={`rounded-full border px-2 py-0.5 text-[0.625rem] uppercase transition-colors ${
            isBlocked
              ? "border-danger text-danger hover:bg-danger hover:text-background"
              : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
          }`}>
          {isBlocked ? "Unblock" : "Block"}
        </button>
      ) : null}
    </li>
  )
}

export default function WatcherList({
  model,
  blockedTrackerIds,
  onToggleBlocking,
  moreSuffix = "in the full report"
}: {
  model: WatcherListModel
  blockedTrackerIds: string[]
  onToggleBlocking: (trackerId: string, blocked: boolean) => void
  moreSuffix?: string
}) {
  if (model.rows.length === 0) return null

  return (
    <div>
      <ul className="mt-2 grid gap-1.5">
        {model.rows.map((row) => (
          <WatcherRowView blockedTrackerIds={blockedTrackerIds} key={row.key} onToggleBlocking={onToggleBlocking} row={row} />
        ))}
      </ul>
      {model.moreCount > 0 ? (
        <p className={`${TYPE.small} mt-1.5`}>
          +{model.moreCount} more {moreSuffix}
        </p>
      ) : null}
    </div>
  )
}
