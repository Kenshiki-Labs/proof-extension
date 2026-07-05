import { expect, test } from "@playwright/test"

import {
  FIRST_PARTY_EXPOSURE_FIXTURE_HTML,
  FULLSTORY_FIXTURE_HTML,
  GOOGLE_ANALYTICS_ADS_FIXTURE_HTML,
  INJECTOR_FIXTURE_HTML,
  META_PIXEL_FIXTURE_HTML,
  COOKIE_SYNC_FIXTURE_HTML,
  PERSISTENCE_FIXTURE_HTML,
  PLAIN_FIXTURE_HTML,
  SDK_GLOBAL_FIXTURE_HTML,
  TRACKER_FIXTURE_HTML,
  UNKNOWN_HOST,
  UNKNOWN_HOST_FIXTURE_HTML,
  readAllEvents,
  readSummaries,
  stubTrackerRoutes,
  stubUnknownHostRoute,
  withExtensionContext,
  withFixtureServer
} from "./fixtures"

const ACCEPTANCE_TRACKERS = ["meta-pixel", "google-analytics", "google-ads", "fullstory"]
const EXPECTED_COMPANY_BY_TRACKER: Record<string, string> = {
  "meta-pixel": "meta",
  "google-analytics": "google",
  "google-ads": "google-ads",
  fullstory: "fullstory"
}

async function observedTrackerIds(worker: Parameters<typeof readAllEvents>[0]) {
  const events = await readAllEvents(worker)
  return [...new Set(events.filter((event) => event.eventType === "request_seen").map((event) => event.trackerId).filter(Boolean))]
}

test("plain fixture produces no tracker observations", async () => {
  await withExtensionContext("fixture-plain", async (context, worker) => {
    await withFixtureServer(PLAIN_FIXTURE_HTML, async (baseUrl) => {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)
      await expect(page.getByRole("heading", { name: "Plain fixture" })).toBeVisible()

      await expect
        .poll(async () => {
          const summaries = await readSummaries(worker)
          const summary = summaries.find((item) => item.origin === new URL(baseUrl).origin)
          return summary ? (summary.events ?? []).filter((event) => event.eventType === "request_seen").length : -1
        }, { timeout: 15_000 })
        .toBe(0)
    })
  })
})

test("Meta Pixel fixture produces meta-pixel observation", async () => {
  await withExtensionContext("fixture-meta", async (context, worker) => {
    await stubTrackerRoutes(context)

    await withFixtureServer(META_PIXEL_FIXTURE_HTML, async (baseUrl) => {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)

      await expect.poll(async () => observedTrackerIds(worker), { timeout: 15_000 }).toContain("meta-pixel")
    })
  })
})

test("Google Analytics and Ads fixture produces google-analytics and google-ads observations", async () => {
  await withExtensionContext("fixture-google", async (context, worker) => {
    await stubTrackerRoutes(context)

    await withFixtureServer(GOOGLE_ANALYTICS_ADS_FIXTURE_HTML, async (baseUrl) => {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)

      await expect
        .poll(async () => {
          const ids = await observedTrackerIds(worker)
          return ["google-analytics", "google-ads"].filter((id) => ids.includes(id))
        }, { timeout: 15_000 })
        .toEqual(["google-analytics", "google-ads"])
    })
  })
})

test("FullStory fixture produces fullstory observation", async () => {
  await withExtensionContext("fixture-fullstory", async (context, worker) => {
    await stubTrackerRoutes(context)

    await withFixtureServer(FULLSTORY_FIXTURE_HTML, async (baseUrl) => {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)

      await expect.poll(async () => observedTrackerIds(worker), { timeout: 15_000 }).toContain("fullstory")
    })
  })
})

test("first-party exposure fixture produces extension-scan browser surface evidence", async () => {
  await withExtensionContext("fixture-exposure", async (context, worker) => {
    await withFixtureServer(FIRST_PARTY_EXPOSURE_FIXTURE_HTML, async (baseUrl) => {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)

      await expect
        .poll(async () => {
          const events = await readAllEvents(worker)
          const exposure = events.find((event) => event.source === "extension-scan" && event.eventType === "browser_surface")
          if (!exposure) return null
          return {
            origin: exposure.origin,
            hasEvidence: exposure.evidence.some((line) => line.includes("Browser APIs exposed passive surface fields"))
          }
        }, { timeout: 15_000 })
        .toEqual({ origin: new URL(baseUrl).origin, hasEvidence: true })
    })
  })
})

test("SDK globals are detected and attributed without any network request", async () => {
  await withExtensionContext("fixture-sdk-globals", async (context, worker) => {
    await withFixtureServer(SDK_GLOBAL_FIXTURE_HTML, async (baseUrl) => {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)

      await expect
        .poll(async () => {
          const events = await readAllEvents(worker)
          const sdkEvents = events.filter((event) => event.eventType === "sdk_detected")
          return {
            trackers: [...new Set(sdkEvents.map((event) => event.trackerId).filter(Boolean))].sort(),
            inventedForOwnGlobal: sdkEvents.some((event) => event.details?.global === "myOwnAppGlobal"),
            metaEvidenceIsFactual: sdkEvents.some(
              (event) =>
                event.trackerId === "meta-pixel" &&
                event.evidence.some((line) => line.includes("Global variable fbq characteristic of Meta Pixel"))
            )
          }
        }, { timeout: 15_000 })
        .toEqual({
          trackers: ["fullstory", "meta-pixel"],
          inventedForOwnGlobal: false,
          metaEvidenceIsFactual: true
        })
    })
  })
})

test("identifier sync requests produce cookie_sync observations with handoff evidence", async () => {
  await withExtensionContext("fixture-cookie-sync", async (context, worker) => {
    await stubTrackerRoutes(context)

    await withFixtureServer(COOKIE_SYNC_FIXTURE_HTML, async (baseUrl) => {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)

      await expect
        .poll(async () => {
          const events = await readAllEvents(worker)
          const syncs = events.filter((event) => event.eventType === "cookie_sync")
          return {
            trackers: [...new Set(syncs.map((event) => event.trackerId))].sort(),
            confirmedRedirect: syncs.some(
              (event) =>
                event.trackerId === "lotame" &&
                event.confidence === "confirmed" &&
                event.evidence.some((line) => line.includes("cross-company identifier handoff"))
            ),
            explainsWhy: syncs.every((event) => event.evidence.some((line) => line.includes("merge their profiles")))
          }
        }, { timeout: 15_000 })
        .toEqual({ trackers: ["liveramp", "lotame"], confirmedRedirect: true, explainsWhy: true })
    })
  })
})

test("tracker fixture produces correct seen states", async () => {
  await withExtensionContext("tracker-seen", async (context, worker) => {
    await stubTrackerRoutes(context)

    await withFixtureServer(
      {
        "/meta": META_PIXEL_FIXTURE_HTML,
        "/google": GOOGLE_ANALYTICS_ADS_FIXTURE_HTML,
        "/fullstory": FULLSTORY_FIXTURE_HTML
      },
      async (baseUrl) => {
        await Promise.all(["/meta", "/google", "/fullstory"].map(async (path) => {
          const page = await context.newPage()
          await page.goto(`${baseUrl}${path}`)
        }))

        await expect
          .poll(async () => {
            const events = await readAllEvents(worker)
            const seen = events.filter((event) => event.eventType === "request_seen")
            return ACCEPTANCE_TRACKERS.filter((id) => seen.some((event) => event.trackerId === id))
          }, { timeout: 15_000 })
          .toEqual(ACCEPTANCE_TRACKERS)

        const events = await readAllEvents(worker)
        for (const trackerId of ACCEPTANCE_TRACKERS) {
          const event = events.find((item) => item.eventType === "request_seen" && item.trackerId === trackerId)
          expect(event, `request_seen for ${trackerId}`).toBeTruthy()
          expect(event?.companyId).toBe(EXPECTED_COMPANY_BY_TRACKER[trackerId])
          expect(event?.confidence).toBe("confirmed")
          expect(event?.status).toBe("active")
          expect(event?.firstParty).toBe(false)
        }
      }
    )
  })
})

test("blocking fullstory produces correct blocked states while others stay seen", async () => {
  await withExtensionContext("tracker-blocked", async (context, worker, extensionId) => {
    const stubs = await stubTrackerRoutes(context)

    await withFixtureServer({ "/google": GOOGLE_ANALYTICS_ADS_FIXTURE_HTML, "/fullstory": FULLSTORY_FIXTURE_HTML }, async (baseUrl) => {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/fullstory`)

      // Wait for baseline seen states, then enable blocking for fullstory
      // through the same message the popup's Block button sends.
      await expect
        .poll(async () => {
          const events = await readAllEvents(worker)
          return events.some((event) => event.trackerId === "fullstory")
        }, { timeout: 15_000 })
        .toBe(true)

      const settingsPage = await context.newPage()
      await settingsPage.goto(`chrome-extension://${extensionId}/popup.html`)
      await settingsPage.evaluate(async () => {
        await chrome.runtime.sendMessage({ type: "UPDATE_SETTINGS", payload: { blockedTrackerIds: ["fullstory"] } })
      })
      await expect
        .poll(() =>
          worker.evaluate(async () => {
            const rules = await chrome.declarativeNetRequest.getDynamicRules()
            return rules.filter((rule) => rule.action.type === "block").length
          })
        )
        .toBeGreaterThan(0)
      await settingsPage.close()

      const fullstoryHitsBefore = stubs.hitCount("edge.fullstory.com")
      const fullstoryIngestHitsBefore = stubs.hitCount("fullstory.com")
      await page.reload()

      // Network-level proof: the DNR rule cancels fullstory requests before
      // they reach the routing layer, while another tracker fixture still loads.
      expect(stubs.hitCount("edge.fullstory.com")).toBe(fullstoryHitsBefore)
      expect(stubs.hitCount("fullstory.com")).toBe(fullstoryIngestHitsBefore)

      const googlePage = await context.newPage()
      await googlePage.goto(`${baseUrl}/google`)
      await expect.poll(() => stubs.hitCount("googleadservices.com"), { timeout: 15_000 }).toBeGreaterThan(0)

      // Storage is eventually consistent now that background writes are
      // coalesced — poll for the seen event instead of reading once.
      await expect
        .poll(async () => {
          const events = await readAllEvents(worker)
          return events.some(
            (event) => event.eventType === "request_seen" && event.trackerId === "google-ads" && event.status === "active"
          )
        }, { timeout: 15_000 })
        .toBe(true)

      const events = await readAllEvents(worker)
      expect(events.some((event) => event.eventType === "request_blocked" && event.trackerId !== "fullstory")).toBe(false)
    })
  })
})

test("navigating to a new origin resets the tab summary", async () => {
  await withExtensionContext("tracker-navreset", async (context, worker) => {
    await stubTrackerRoutes(context)

    await withFixtureServer(TRACKER_FIXTURE_HTML, async (trackerBase) => {
      await withFixtureServer(PLAIN_FIXTURE_HTML, async (plainBase) => {
        const page = await context.newPage()
        await page.goto(`${trackerBase}/`)

        await expect
          .poll(async () => (await readAllEvents(worker)).some((event) => event.trackerId === "fullstory"), {
            timeout: 15_000
          })
          .toBe(true)

        // Same tab, different origin (different port) — the summary must
        // reset instead of carrying tracker evidence to the new page.
        await page.goto(`${plainBase}/`)

        await expect
          .poll(async () => {
            const summaries = await readSummaries(worker)
            const plain = summaries.find((summary) => summary.origin === new URL(plainBase).origin)
            return plain ? (plain.events ?? []).filter((event) => event.eventType === "request_seen").length : -1
          }, { timeout: 15_000 })
          .toBe(0)

        const summaries = await readSummaries(worker)
        const plain = summaries.find((summary) => summary.origin === new URL(plainBase).origin)
        const pageActivity = (plain?.events ?? []).filter(
          (event) => event.eventType !== "extension_diagnostic" && event.source !== "extension-scan"
        )
        expect(pageActivity).toEqual([])
      })
    })
  })
})

test("persistence surfaces produce metadata-only observations without stored values", async () => {
  await withExtensionContext("persistence", async (context, worker) => {
    await withFixtureServer(PERSISTENCE_FIXTURE_HTML, async (baseUrl) => {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)

      await expect
        .poll(async () => {
          const events = await readAllEvents(worker)
          const types = new Set<string>(events.map((event) => event.eventType))
          return ["cookie_observed", "storage_write", "indexeddb_access"].filter((type) => types.has(type))
        }, { timeout: 15_000 })
        .toEqual(["cookie_observed", "storage_write", "indexeddb_access"])

      const events = await readAllEvents(worker)
      const serialized = JSON.stringify(events)

      // Values must never be stored — names, sizes, and timing only.
      expect(serialized).not.toContain("secret-cookie-value")
      expect(serialized).not.toContain("secret-local-value")
      expect(serialized).not.toContain("secret-session-value")

      const cookie = events.find((event) => event.eventType === "cookie_observed")
      expect(cookie?.details?.name).toBe("fixture_pref")
      expect(cookie?.details?.valueBytes).toBe("secret-cookie-value-123456".length)
      expect(cookie?.trackerId).toBeUndefined()
      expect(cookie?.status).toBe("active")
      expect(cookie?.blockability).toBe("observable_only")

      const storageOps = events
        .filter((event) => event.eventType === "storage_write")
        .map((event) => `${String(event.details?.area)}:${String(event.details?.op)}`)
      expect(storageOps).toContain("localStorage:set")
      expect(storageOps).toContain("localStorage:remove")
      expect(storageOps).toContain("sessionStorage:set")

      const database = events.find((event) => event.eventType === "indexeddb_access")
      expect(database?.details?.database).toBe("fixture-db")
    })
  })
})

test("dynamically injected tracker script is detected and attributed", async () => {
  await withExtensionContext("tracker-inject", async (context, worker) => {
    await stubTrackerRoutes(context)

    await withFixtureServer(INJECTOR_FIXTURE_HTML, async (baseUrl) => {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)

      await expect
        .poll(async () => {
          const events = await readAllEvents(worker)
          const injected = events.find(
            (event) => event.eventType === "script_injected" && event.id.startsWith("dom_script:")
          )
          if (!injected) return null
          return {
            trackerId: injected.trackerId ?? null,
            hasEvidence: injected.evidence.some((line) => line.includes("Script inserted after page load"))
          }
        }, { timeout: 15_000 })
        .toEqual({ trackerId: "fullstory", hasEvidence: true })
    })
  })
})

test("unknown third-party host is observed but never claimed as a named observer", async () => {
  await withExtensionContext("unknown-host", async (context, worker) => {
    await stubTrackerRoutes(context)
    await stubUnknownHostRoute(context)

    await withFixtureServer(UNKNOWN_HOST_FIXTURE_HTML, async (baseUrl) => {
      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)

      await expect
        .poll(async () => {
          const events = await readAllEvents(worker)
          const unknown = events.find(
            (event) => event.eventType === "request_seen" && event.details?.host === UNKNOWN_HOST
          )
          if (!unknown) return null
          return {
            trackerId: unknown.trackerId ?? null,
            companyId: unknown.companyId ?? null,
            evidenceTier: unknown.evidenceTier ?? null,
            blockability: unknown.blockability,
            statesUnmatched: unknown.evidence.some((line) => line.includes("no tracker record matched"))
          }
        }, { timeout: 15_000 })
        .toEqual({
          trackerId: null,
          companyId: null,
          evidenceTier: "observed",
          blockability: "observable_only",
          statesUnmatched: true
        })

      // The known tracker on the same page still gets full attribution —
      // the unclassified lane must not swallow classified matches.
      await expect
        .poll(async () => (await readAllEvents(worker)).some((event) => event.trackerId === "fullstory"), { timeout: 15_000 })
        .toBe(true)

      // The unknown host must never inflate named-company summary buckets.
      const summaries = await readSummaries(worker)
      const fixtureSummary = summaries.find((summary) => summary.origin === new URL(baseUrl).origin)
      expect(fixtureSummary?.activeCompanies).not.toContain(UNKNOWN_HOST)
      expect(fixtureSummary?.activeCompanies).toContain("fullstory")
    })
  })
})

test("blocked state carries the production err_blocked_by_client signal, not just the dev-only debug event", async () => {
  await withExtensionContext("blocked-prod-signal", async (context, worker, extensionId) => {
    const stubs = await stubTrackerRoutes(context)

    await withFixtureServer(FULLSTORY_FIXTURE_HTML, async (baseUrl) => {
      const settingsPage = await context.newPage()
      await settingsPage.goto(`chrome-extension://${extensionId}/popup.html`)
      await settingsPage.evaluate(async () => {
        await chrome.runtime.sendMessage({ type: "UPDATE_SETTINGS", payload: { blockedTrackerIds: ["fullstory"] } })
      })
      await expect
        .poll(() =>
          worker.evaluate(async () => {
            const rules = await chrome.declarativeNetRequest.getDynamicRules()
            return rules.filter((rule) => rule.action.type === "block").length
          })
        )
        .toBeGreaterThan(0)
      await settingsPage.close()

      const page = await context.newPage()
      await page.goto(`${baseUrl}/`)

      // Network-level proof the DNR rule cancelled the request.
      expect(stubs.hitCount("fullstory.com")).toBe(0)

      // Product-level proof for packed builds: the blocked event's signal
      // provenance must include err_blocked_by_client — the only signal
      // available outside unpacked dev builds, where onRuleMatchedDebug
      // does not exist. This asserts the production path matched the URL
      // to OUR installed rule and recorded/confirmed the outcome.
      await expect
        .poll(async () => {
          const events = await readAllEvents(worker)
          const blocked = events.filter((event) => event.eventType === "request_blocked" && event.trackerId === "fullstory")
          if (blocked.length === 0) return null
          return {
            productionSignalFired: blocked.some((event) => String(event.details?.blockSignals ?? "").includes("err_blocked_by_client")),
            noDoubleCount: blocked.every((event) => (event.count ?? 1) === 1),
            allBlocked: blocked.every((event) => event.status === "blocked")
          }
        }, { timeout: 15_000 })
        .toEqual({ productionSignalFired: true, noDoubleCount: true, allBlocked: true })

      // The seen-event for the same request must have been superseded —
      // fullstory is blocked, not simultaneously watching.
      const events = await readAllEvents(worker)
      const blockedRequestIds = new Set(
        events.filter((event) => event.eventType === "request_blocked" && event.trackerId === "fullstory").map((event) => event.details?.requestId)
      )
      const stillSeen = events.filter(
        (event) => event.eventType === "request_seen" && event.trackerId === "fullstory" && blockedRequestIds.has(event.details?.requestId)
      )
      expect(stillSeen).toEqual([])
    })
  })
})
