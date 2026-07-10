// Page-safe shims: instead of blocking a tracker's script (which breaks
// pages that call its API unguarded), a DNR redirect serves a local
// impostor that defines the expected surface — globals, queues, callbacks —
// while nothing ever reaches the tracker's servers. The return path is
// closed too: beacons redirect to a bundled pixel, XHR/ping are blocked
// outright (fire-and-forget sends that no page logic waits on).
//
// A tracker earns a registry entry only when its shim resource actually
// implements the API surface pages depend on. This is deliberately not
// derived from trackers.json: shim coverage is a property of the shim
// files shipped in this build, not of the intelligence snapshot.

export type ShimSpec = {
  /** Extension path of the script impostor served for `script` requests. */
  scriptPath: string
  /** Extension path served for `image` beacon requests. */
  imagePath: string
}

const GTAG_SHIM: ShimSpec = {
  scriptPath: "/shims/gtag.js",
  imagePath: "/shims/pixel.gif"
}

// The proof pair: google-tag-manager is exactly the tracker blocking can
// never touch (user_action_required — tag delivery breaks sites), which is
// the case shims exist for.
const SHIMS_BY_TRACKER_ID: ReadonlyMap<string, ShimSpec> = new Map([
  ["google-analytics", GTAG_SHIM],
  ["google-tag-manager", GTAG_SHIM]
])

export function shimForTrackerId(trackerId: string | undefined): ShimSpec | null {
  return (trackerId && SHIMS_BY_TRACKER_ID.get(trackerId)) || null
}

// Defense in depth, mirroring filterBlockableTrackerIds: only ids with a
// shipped shim resource ever produce redirect rules, whatever settings say.
export function filterShimmableTrackerIds(trackerIds: readonly string[]): string[] {
  return trackerIds.filter((trackerId) => SHIMS_BY_TRACKER_ID.has(trackerId))
}
