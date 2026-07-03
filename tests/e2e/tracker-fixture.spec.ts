import { expect, test } from "@playwright/test"

import {
  FIRST_PARTY_EXPOSURE_FIXTURE_HTML,
  FULLSTORY_FIXTURE_HTML,
  GOOGLE_ANALYTICS_ADS_FIXTURE_HTML,
  INJECTOR_FIXTURE_HTML,
  META_PIXEL_FIXTURE_HTML,
  PLAIN_FIXTURE_HTML,
  TRACKER_FIXTURE_HTML,
  readAllEvents,
  readSummaries,
  stubTrackerRoutes,
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

      const events = await readAllEvents(worker)
      expect(events.some((event) => event.eventType === "request_blocked" && event.trackerId !== "fullstory")).toBe(false)
      expect(
        events.some((event) => event.eventType === "request_seen" && event.trackerId === "google-ads" && event.status === "active")
      ).toBe(true)
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
