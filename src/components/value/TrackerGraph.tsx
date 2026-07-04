import { useMemo, useState } from "react"

import { SERVES_LABELS } from "~core/domain/valuation"
import { getTrackerSupplyChainRole, SUPPLY_CHAIN_STAGES, SUPPLY_CHAIN_LABELS, type SupplyChainRole } from "~core/domain/supply-chain"
import type { ValuationEdge } from "~core/domain/types"
import { TYPE, UI } from "~components/system/tokens"

// Site ↔ tracker network, rendered as a deterministic bipartite SVG built in
// real time from the user's local ledger. Sites on the left, trackers on the
// right; edge thickness = observations, edge color = who the tracker serves.
// Deliberately NOT force-directed: an evidence product should show the same
// data as the same picture every time, with no physics randomness.

// Tokenized per-category classes (design primitives: no raw colors, no
// inline styles). Same palette as the status chips: emerald = works for
// you, muted = works for the site, amber = ads trade, red = no trade.
const SERVES_CLASSES: Record<ValuationEdge["servesCategory"], { stroke: string; fill: string; dot: string }> = {
  you_and_the_site: { stroke: "stroke-emerald-700", fill: "fill-emerald-700", dot: "bg-emerald-700" },
  the_site: { stroke: "stroke-muted-foreground", fill: "fill-muted-foreground", dot: "bg-muted-foreground" },
  advertisers_and_maybe_you: { stroke: "stroke-amber-700", fill: "fill-amber-700", dot: "bg-amber-700" },
  only_their_business: { stroke: "stroke-danger", fill: "fill-danger", dot: "bg-danger" }
}

// Supply-chain mode: one hue per stage, ordered by position in the money
// flow so the tracker column reads top-to-bottom as ore → ad.
const STAGE_CLASSES: Record<SupplyChainRole, { stroke: string; fill: string; dot: string }> = {
  mine_infrastructure: { stroke: "stroke-stone-500", fill: "fill-stone-500", dot: "bg-stone-500" },
  concentrator: { stroke: "stroke-cyan-700", fill: "fill-cyan-700", dot: "bg-cyan-700" },
  refinery: { stroke: "stroke-violet-700", fill: "fill-violet-700", dot: "bg-violet-700" },
  parts_supplier: { stroke: "stroke-indigo-700", fill: "fill-indigo-700", dot: "bg-indigo-700" },
  assembly: { stroke: "stroke-blue-700", fill: "fill-blue-700", dot: "bg-blue-700" },
  wholesale: { stroke: "stroke-sky-700", fill: "fill-sky-700", dot: "bg-sky-700" },
  retail_shelf: { stroke: "stroke-orange-600", fill: "fill-orange-600", dot: "bg-orange-600" },
  vertically_integrated: { stroke: "stroke-danger", fill: "fill-danger", dot: "bg-danger" },
  site_tooling: { stroke: "stroke-muted-foreground", fill: "fill-muted-foreground", dot: "bg-muted-foreground" }
}

const STAGE_ORDER: Record<SupplyChainRole, number> = Object.fromEntries(
  SUPPLY_CHAIN_STAGES.map((stage, index) => [stage.role, index])
) as Record<SupplyChainRole, number>

type GraphMode = "serves" | "chain"

const MAX_SITES = 8
const MAX_TRACKERS = 14
const ROW_HEIGHT = 34
const TOP_PAD = 26

function shortSite(origin: string) {
  return origin.replace(/^https?:\/\/(www\.)?/, "")
}

export default function TrackerGraph({ edges }: { edges: ValuationEdge[] }) {
  const [focused, setFocused] = useState<string | null>(null)
  const [mode, setMode] = useState<GraphMode>("serves")

  const { sites, trackers, visibleEdges, height } = useMemo(() => {
    const siteWeight = new Map<string, number>()
    const trackerWeight = new Map<string, number>()
    for (const edge of edges) {
      siteWeight.set(edge.siteOrigin, (siteWeight.get(edge.siteOrigin) ?? 0) + edge.observations)
      trackerWeight.set(edge.trackerId, (trackerWeight.get(edge.trackerId) ?? 0) + edge.observations)
    }
    const bySeverity = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0])
    const sites = [...siteWeight.entries()].sort(bySeverity).slice(0, MAX_SITES).map(([id]) => id)
    const byChain = (a: [string, number], b: [string, number]) =>
      (STAGE_ORDER[getTrackerSupplyChainRole(a[0]) ?? "site_tooling"] - STAGE_ORDER[getTrackerSupplyChainRole(b[0]) ?? "site_tooling"]) || bySeverity(a, b)
    const trackers = [...trackerWeight.entries()]
      .sort(bySeverity)
      .slice(0, MAX_TRACKERS)
      .sort(mode === "chain" ? byChain : bySeverity)
      .map(([id]) => id)
    const siteSet = new Set(sites)
    const trackerSet = new Set(trackers)
    const visibleEdges = edges.filter((edge) => siteSet.has(edge.siteOrigin) && trackerSet.has(edge.trackerId))
    const height = TOP_PAD + Math.max(sites.length, trackers.length) * ROW_HEIGHT + 10
    return { sites, trackers, visibleEdges, height }
  }, [edges, mode])

  if (visibleEdges.length === 0) return null

  const maxObservations = Math.max(...visibleEdges.map((edge) => edge.observations))
  const siteY = (id: string) => TOP_PAD + sites.indexOf(id) * ROW_HEIGHT + ROW_HEIGHT / 2
  const trackerY = (id: string) => TOP_PAD + trackers.indexOf(id) * ROW_HEIGHT + ROW_HEIGHT / 2
  const isDimmed = (edge: ValuationEdge) => focused !== null && edge.siteOrigin !== focused && edge.trackerId !== focused

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {(
          [
            { label: "Who it serves", value: "serves" },
            { label: "Supply chain", value: "chain" }
          ] as Array<{ label: string; value: GraphMode }>
        ).map((item) => (
          <button
            className={`${UI.segment} ${mode === item.value ? UI.segmentActive : UI.segmentIdle}`}
            key={item.value}
            onClick={() => setMode(item.value)}
            type="button">
            {item.label}
          </button>
        ))}
      </div>
      <svg
        aria-label="Connections between sites you visited and the trackers observed on them"
        className="w-full"
        role="img"
        viewBox={`0 0 720 ${height}`}>
        {visibleEdges.map((edge) => {
          const y1 = siteY(edge.siteOrigin)
          const y2 = trackerY(edge.trackerId)
          const width = 1 + (edge.observations / maxObservations) * 4
          return (
            <path
              d={`M 218 ${y1} C 360 ${y1}, 360 ${y2}, 500 ${y2}`}
              fill="none"
              key={`${edge.siteOrigin}|${edge.trackerId}`}
              className={mode === "chain" ? STAGE_CLASSES[getTrackerSupplyChainRole(edge.trackerId) ?? "site_tooling"].stroke : SERVES_CLASSES[edge.servesCategory].stroke}
              opacity={isDimmed(edge) ? 0.12 : 0.55}
              strokeWidth={width}
            />
          )
        })}
        {sites.map((site) => (
          <g
            key={site}
            onMouseEnter={() => setFocused(site)}
            onMouseLeave={() => setFocused(null)}>
            <text
              fontSize="12"
              opacity={focused !== null && focused !== site && !visibleEdges.some((edge) => edge.trackerId === focused && edge.siteOrigin === site) ? 0.3 : 1}
              textAnchor="end"
              x="210"
              y={siteY(site) + 4}>
              {shortSite(site)}
            </text>
          </g>
        ))}
        {trackers.map((tracker) => {
          const servesCategory = visibleEdges.find((edge) => edge.trackerId === tracker)?.servesCategory ?? "the_site"
          const nodeClasses = mode === "chain" ? STAGE_CLASSES[getTrackerSupplyChainRole(tracker) ?? "site_tooling"] : SERVES_CLASSES[servesCategory]
          return (
            <g
              key={tracker}
              onMouseEnter={() => setFocused(tracker)}
              onMouseLeave={() => setFocused(null)}>
              <circle className={nodeClasses.fill} cx="508" cy={trackerY(tracker)} r="4" />
              <text
                fontSize="12"
                opacity={focused !== null && focused !== tracker && !visibleEdges.some((edge) => edge.siteOrigin === focused && edge.trackerId === tracker) ? 0.3 : 1}
                x="520"
                y={trackerY(tracker) + 4}>
                {tracker}
              </text>
            </g>
          )
        })}
        <text className="fill-current" fontSize="11" opacity="0.6" x="0" y="12">
          Sites you visited
        </text>
        <text className="fill-current" fontSize="11" opacity="0.6" x="508" y="12">
          Who was there
        </text>
      </svg>
      <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 ${TYPE.small}`}>
        {mode === "serves"
          ? (Object.keys(SERVES_CLASSES) as Array<ValuationEdge["servesCategory"]>).map((category) => (
              <span className="flex items-center gap-1.5" key={category}>
                <span className={`inline-block h-2 w-2 rounded-full ${SERVES_CLASSES[category].dot}`} />
                {SERVES_LABELS[category]}
              </span>
            ))
          : SUPPLY_CHAIN_STAGES.map((stage) => (
              <span className="flex items-center gap-1.5" key={stage.role}>
                <span className={`inline-block h-2 w-2 rounded-full ${STAGE_CLASSES[stage.role].dot}`} />
                {SUPPLY_CHAIN_LABELS[stage.role]}
              </span>
            ))}
      </div>
      <p className={`${TYPE.small} mt-1.5`}>
        Thicker lines mean more observations. Hover a site or tracker to isolate its connections.
      </p>
    </div>
  )
}
