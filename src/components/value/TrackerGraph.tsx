import { useMemo, useState } from "react"

import { TYPE, UI } from "~components/system/tokens"
import { getTrackerSupplyChainRole, SUPPLY_CHAIN_LABELS, SUPPLY_CHAIN_STAGES, type SupplyChainRole } from "~core/domain/supply-chain"
import type { UnclassifiedGraphEdge, ValuationEdge } from "~core/domain/types"
import { formatUsdRange, getTrackerValuation, SERVES_LABELS } from "~core/domain/valuation"

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

// Gray, like "the_site"/"site_tooling" — "we don't know" reads the same as
// "not obviously predatory" at a glance, and the label (a raw hostname
// instead of a company name) is what actually tells them apart.
const UNKNOWN_CLASSES = { stroke: "stroke-muted-foreground", fill: "fill-muted-foreground", dot: "bg-muted-foreground" }

type GraphMode = "serves" | "chain" | "value"

const MAX_SITES = 8
const MAX_TRACKERS = 14
const ROW_HEIGHT = 34
const TOP_PAD = 26
const MIN_NODE_RADIUS = 4
const MAX_NODE_RADIUS = 11
const UNCLASSIFIED_PREFIX = "unclassified:"

function shortSite(origin: string) {
  return origin.replace(/^https?:\/\/(www\.)?/, "")
}

// Who makes what, in the picture: annual midpoint value for a tracker, or 0
// when we have no priced record — an unpriced tracker still gets a node, it
// just doesn't inflate in "value" mode. Unclassified nodes (never a real
// tracker id) always resolve to 0 here, same as an unpriced named tracker.
function trackerAnnualMidpoint(trackerId: string): number {
  return getTrackerValuation(trackerId)?.annual.midpoint_usd ?? 0
}

function trackerAnnualRange(trackerId: string): { low: number; high: number } | null {
  const value = getTrackerValuation(trackerId)
  return value ? { low: value.annual.low_usd, high: value.annual.high_usd } : null
}

// Internal shape both ValuationEdge (named, priced) and UnclassifiedGraphEdge
// (unnamed, unpriced) normalize into, so one rendering path handles both —
// see docs/observer-spec.md and the report-tab story-arc discussion: the
// graph must show every observed third party, not only the ones our DB has
// codified, or it silently contradicts the "Watching" headline count.
type GraphEdge = {
  siteOrigin: string
  nodeId: string
  nodeLabel: string
  observations: number
  servesCategory: ValuationEdge["servesCategory"] | null
}

function toGraphEdges(edges: ValuationEdge[], unclassifiedEdges: UnclassifiedGraphEdge[]): GraphEdge[] {
  return [
    ...edges.map((edge) => ({
      siteOrigin: edge.siteOrigin,
      nodeId: edge.trackerId,
      nodeLabel: edge.trackerId,
      observations: edge.observations,
      servesCategory: edge.servesCategory
    })),
    ...unclassifiedEdges.map((edge) => ({
      siteOrigin: edge.siteOrigin,
      nodeId: `${UNCLASSIFIED_PREFIX}${edge.host}`,
      nodeLabel: edge.host,
      observations: edge.observations,
      servesCategory: null
    }))
  ]
}

function classesFor(mode: GraphMode, servesCategory: ValuationEdge["servesCategory"] | null, nodeId: string) {
  if (servesCategory === null) return UNKNOWN_CLASSES
  if (mode === "chain") return STAGE_CLASSES[getTrackerSupplyChainRole(nodeId) ?? "site_tooling"]
  return SERVES_CLASSES[servesCategory]
}

export default function TrackerGraph({
  edges,
  unclassifiedEdges = []
}: {
  edges: ValuationEdge[]
  unclassifiedEdges?: UnclassifiedGraphEdge[]
}) {
  const [focused, setFocused] = useState<string | null>(null)
  const [mode, setMode] = useState<GraphMode>("serves")

  const { sites, trackers, visibleEdges, height } = useMemo(() => {
    const graphEdges = toGraphEdges(edges, unclassifiedEdges)
    const siteWeight = new Map<string, number>()
    const trackerWeight = new Map<string, number>()
    for (const edge of graphEdges) {
      siteWeight.set(edge.siteOrigin, (siteWeight.get(edge.siteOrigin) ?? 0) + edge.observations)
      trackerWeight.set(edge.nodeId, (trackerWeight.get(edge.nodeId) ?? 0) + edge.observations)
    }
    const bySeverity = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0])
    const sites = [...siteWeight.entries()]
      .sort(bySeverity)
      .slice(0, MAX_SITES)
      .map(([id]) => id)
    const byChain = (a: [string, number], b: [string, number]) =>
      STAGE_ORDER[getTrackerSupplyChainRole(a[0]) ?? "site_tooling"] - STAGE_ORDER[getTrackerSupplyChainRole(b[0]) ?? "site_tooling"] ||
      bySeverity(a, b)
    const byValue = (a: [string, number], b: [string, number]) =>
      trackerAnnualMidpoint(b[0]) - trackerAnnualMidpoint(a[0]) || bySeverity(a, b)
    const modeSort = mode === "chain" ? byChain : mode === "value" ? byValue : bySeverity
    const trackers = [...trackerWeight.entries()]
      .sort(bySeverity)
      .slice(0, MAX_TRACKERS)
      .sort(modeSort)
      .map(([id]) => id)
    const siteSet = new Set(sites)
    const trackerSet = new Set(trackers)
    const visibleEdges = graphEdges.filter((edge) => siteSet.has(edge.siteOrigin) && trackerSet.has(edge.nodeId))
    const height = TOP_PAD + Math.max(sites.length, trackers.length) * ROW_HEIGHT + 10
    return { sites, trackers, visibleEdges, height }
  }, [edges, unclassifiedEdges, mode])

  if (visibleEdges.length === 0) return null

  const maxObservations = Math.max(...visibleEdges.map((edge) => edge.observations))
  const maxAnnualMidpoint = Math.max(1, ...trackers.map(trackerAnnualMidpoint))
  const hasUnclassifiedNode = trackers.some((id) => id.startsWith(UNCLASSIFIED_PREFIX))
  // Radius scales by sqrt of value, not value itself — circle AREA should
  // read as proportional to the dollar amount, or a 10x tracker looks 100x.
  const nodeRadius = (trackerId: string) =>
    mode === "value"
      ? MIN_NODE_RADIUS + Math.sqrt(trackerAnnualMidpoint(trackerId) / maxAnnualMidpoint) * (MAX_NODE_RADIUS - MIN_NODE_RADIUS)
      : 4
  const siteY = (id: string) => TOP_PAD + sites.indexOf(id) * ROW_HEIGHT + ROW_HEIGHT / 2
  const trackerY = (id: string) => TOP_PAD + trackers.indexOf(id) * ROW_HEIGHT + ROW_HEIGHT / 2
  const isDimmed = (edge: GraphEdge) => focused !== null && edge.siteOrigin !== focused && edge.nodeId !== focused

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {(
          [
            { label: "Who it serves", value: "serves" },
            { label: "Supply chain", value: "chain" },
            { label: "Who makes what", value: "value" }
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
          const y2 = trackerY(edge.nodeId)
          const width = 1 + (edge.observations / maxObservations) * 4
          return (
            <path
              d={`M 218 ${y1} C 360 ${y1}, 360 ${y2}, 500 ${y2}`}
              fill="none"
              key={`${edge.siteOrigin}|${edge.nodeId}`}
              className={classesFor(mode, edge.servesCategory, edge.nodeId).stroke}
              opacity={isDimmed(edge) ? 0.12 : 0.55}
              strokeWidth={width}
            />
          )
        })}
        {sites.map((site) => (
          <g key={site} onMouseEnter={() => setFocused(site)} onMouseLeave={() => setFocused(null)}>
            <text
              fontSize="12"
              opacity={
                focused !== null && focused !== site && !visibleEdges.some((edge) => edge.nodeId === focused && edge.siteOrigin === site)
                  ? 0.3
                  : 1
              }
              textAnchor="end"
              x="210"
              y={siteY(site) + 4}>
              {shortSite(site)}
            </text>
          </g>
        ))}
        {trackers.map((tracker) => {
          const representativeEdge = visibleEdges.find((edge) => edge.nodeId === tracker)
          const nodeClasses = classesFor(mode, representativeEdge?.servesCategory ?? null, tracker)
          const annualRange = mode === "value" ? trackerAnnualRange(tracker) : null
          return (
            <g key={tracker} onMouseEnter={() => setFocused(tracker)} onMouseLeave={() => setFocused(null)}>
              <circle className={nodeClasses.fill} cx="508" cy={trackerY(tracker)} r={nodeRadius(tracker)} />
              <text
                fontSize="12"
                opacity={
                  focused !== null &&
                  focused !== tracker &&
                  !visibleEdges.some((edge) => edge.siteOrigin === focused && edge.nodeId === tracker)
                    ? 0.3
                    : 1
                }
                x="520"
                y={trackerY(tracker) + 4}>
                {representativeEdge?.nodeLabel ?? tracker}
                {annualRange ? (
                  <tspan className="fill-current opacity-60"> · {formatUsdRange(annualRange.low, annualRange.high)}/yr</tspan>
                ) : null}
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
        {mode === "chain"
          ? SUPPLY_CHAIN_STAGES.map((stage) => (
              <span className="flex items-center gap-1.5" key={stage.role}>
                <span className={`inline-block h-2 w-2 rounded-full ${STAGE_CLASSES[stage.role].dot}`} />
                {SUPPLY_CHAIN_LABELS[stage.role]}
              </span>
            ))
          : (Object.keys(SERVES_CLASSES) as Array<ValuationEdge["servesCategory"]>).map((category) => (
              <span className="flex items-center gap-1.5" key={category}>
                <span className={`inline-block h-2 w-2 rounded-full ${SERVES_CLASSES[category].dot}`} />
                {SERVES_LABELS[category]}
              </span>
            ))}
        {hasUnclassifiedNode ? (
          <span className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${UNKNOWN_CLASSES.dot}`} />
            Not yet classified — observed, not in our tracker database
          </span>
        ) : null}
      </div>
      <p className={`${TYPE.small} mt-1.5`}>
        {mode === "value"
          ? "Circle size is estimated annual value extracted, not requests — the biggest circles are the ones profiting most from you. Unpriced and unclassified nodes still appear, at minimum size."
          : "Thicker lines mean more observations. Hover a site or tracker to isolate its connections."}
      </p>
    </div>
  )
}
