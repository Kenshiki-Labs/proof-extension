import { describe, expect, it } from "vitest"

import { detectCookieSync, type SyncTracker } from "./cookie-sync"

// Minimal structural fixtures: sync detection needs only id + domains, so
// these tests stay independent of the full tracker DB and its migrations.
const trackers: SyncTracker[] = [
  { id: "pubmatic", match: { domains: ["pubmatic.com"] } },
  { id: "liveramp", match: { domains: ["rlcdn.com"] } },
  { id: "lotame", match: { domains: ["crwdcntrl.net"] } },
  { id: "id5", match: { domains: ["id5-sync.com"] } },
  { id: "fullstory", match: { domains: ["fullstory.com", "edge.fullstory.com"] } }
]
const byId = (id: string) => {
  const tracker = trackers.find((item) => item.id === id)
  if (!tracker) throw new Error(`missing tracker ${id}`)
  return tracker
}

describe("detectCookieSync", () => {
  it("detects sync-shaped path segments as probable", () => {
    const detection = detectCookieSync("https://ads.pubmatic.com/AdServer/js/usersync?p=1", byId("pubmatic"), trackers)
    expect(detection).toMatchObject({ confidence: "probable" })
    expect(detection?.indicators).toContain("sync_path:usersync")
    expect(detection?.evidence[0]).toContain('identifier-sync segment "usersync"')
  })

  it("detects identifier handoff parameters", () => {
    const detection = detectCookieSync("https://rlcdn.com/365868.gif?partner_uid=abc123", byId("liveramp"), trackers)
    expect(detection).toMatchObject({ confidence: "probable" })
    expect(detection?.indicators).toContain("handoff_param:partner_uid")
  })

  it("confirms redirect handoffs pointing at another known tracker", () => {
    const detection = detectCookieSync(
      "https://crwdcntrl.net/sync?redir=https%3A%2F%2Frlcdn.com%2Fsync%3Fuid%3D123",
      byId("lotame"),
      trackers
    )
    expect(detection).toMatchObject({ confidence: "confirmed" })
    expect(detection?.indicators).toContain("redirect_partner:liveramp")
    expect(detection?.evidence.some((line) => line.includes("cross-company identifier handoff"))).toBe(true)
  })

  it("always explains why syncing matters", () => {
    const detection = detectCookieSync("https://id5-sync.com/getuid", byId("id5"), trackers)
    expect(detection?.evidence.at(-1)).toContain("merge their profiles")
  })

  it("does not flag ordinary tracker requests or substring lookalikes", () => {
    expect(detectCookieSync("https://fullstory.com/rec/page", byId("fullstory"), trackers)).toBeNull()
    expect(detectCookieSync("https://pubmatic.com/synchronize-tabs?id=1", byId("pubmatic"), trackers)).toBeNull()
    expect(detectCookieSync("https://pubmatic.com/page?ref=home", byId("pubmatic"), trackers)).toBeNull()
    expect(detectCookieSync("not a url", byId("pubmatic"), trackers)).toBeNull()
  })

  it("does not treat the matched tracker's own domain as a sync partner", () => {
    const detection = detectCookieSync("https://id5-sync.com/gif?cb=https%3A%2F%2Fid5-sync.com%2Fdone", byId("id5"), trackers)
    // Own-domain callback with no other signal: no detection at all — and
    // certainly no redirect_partner claim against the tracker itself.
    expect(detection).toBeNull()
  })
})
