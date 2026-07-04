import { useMemo, useState } from "react"

import { SERVES_LABELS } from "~core/domain/valuation"
import type { ValuationEdge } from "~core/domain/types"
import { TYPE } from "~components/system/tokens"

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

const MAX_SITES = 8
const MAX_TRACKERS = 14
const ROW_HEIGHT = 34
const TOP_PAD = 26

function shortSite(origin: string) {
  return origin.replace(/^https?:\/\/(www\.)?/, "")
}

export default function TrackerGraph({ edges }: { edges: ValuationEdge[] }) {
  const [focused, setFocused] = useState<string | null>(null)

  const { sites, trackers, visibleEdges, height } = useMemo(() => {
    const siteWeight = new Map<string, number>()
    const trackerWeight = new Map<string, number>()
    for (const edge of edges) {
      siteWeight.set(edge.siteOrigin, (siteWeight.get(edge.siteOrigin) ?? 0) + edge.observations)
      trackerWeight.set(edge.trackerId, (trackerWeight.get(edge.trackerId) ?? 0) + edge.observations)
    }
    const bySeverity = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0])
    const sites = [...siteWeight.entries()].sort(bySeverity).slice(0, MAX_SITES).map(([id]) => id)
    const trackers = [...trackerWeight.entries()].sort(bySeverity).slice(0, MAX_TRACKERS).map(([id]) => id)
    const siteSet = new Set(sites)
    const trackerSet = new Set(trackers)
    const visibleEdges = edges.filter((edge) => siteSet.has(edge.siteOrigin) && trackerSet.has(edge.trackerId))
    const height = TOP_PAD + Math.max(sites.length, trackers.length) * ROW_HEIGHT + 10
    return { sites, trackers, visibleEdges, height }
  }, [edges])

  if (visibleEdges.length === 0) return null

  const maxObservations = Math.max(...visibleEdges.map((edge) => edge.observations))
  const siteY = (id: string) => TOP_PAD + sites.indexOf(id) * ROW_HEIGHT + ROW_HEIGHT / 2
  const trackerY = (id: string) => TOP_PAD + trackers.indexOf(id) * ROW_HEIGHT + ROW_HEIGHT / 2
  const isDimmed = (edge: ValuationEdge) => focused !== null && edge.siteOrigin !== focused && edge.trackerId !== focused

  return (
    <div>
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
              className={SERVES_CLASSES[edge.servesCategory].stroke}
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
          const category = visibleEdges.find((edge) => edge.trackerId === tracker)?.servesCategory ?? "the_site"
          return (
            <g
              key={tracker}
              onMouseEnter={() => setFocused(tracker)}
              onMouseLeave={() => setFocused(null)}>
              <circle className={SERVES_CLASSES[category].fill} cx="508" cy={trackerY(tracker)} r="4" />
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
        {(Object.keys(SERVES_CLASSES) as Array<ValuationEdge["servesCategory"]>).map((category) => (
          <span className="flex items-center gap-1.5" key={category}>
            <span className={`inline-block h-2 w-2 rounded-full ${SERVES_CLASSES[category].dot}`} />
            {SERVES_LABELS[category]}
          </span>
        ))}
      </div>
      <p className={`${TYPE.small} mt-1.5`}>
        Thicker lines mean more observations. Hover a site or tracker to isolate its connections.
      </p>
    </div>
  )
}
