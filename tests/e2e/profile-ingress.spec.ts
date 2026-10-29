import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"

import { readAllEvents, withExtensionContext, withFixtureServer } from "./fixtures"

const PROFILE_URL = "https://gateway.kenshikilabs.com/services/bond/api/session-profile"

test("the actual report reveal uses canonical credential-free ingress only after its explicit click", async () => {
  await withExtensionContext(`profile-ingress-${randomUUID()}`, async (context, worker, extensionId) => {
    const requests: { method: string; headers: Record<string, string> }[] = []
    const denied: string[] = []
    const maps: string[] = []
    await context.addCookies([
      { name: "__Host-profile-fixture", value: "synthetic", url: "https://gateway.kenshikilabs.com/", secure: true, sameSite: "None" }
    ])
    await context.route("**/*", async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.protocol === "chrome-extension:" || url.hostname === "127.0.0.1") return route.continue()
      if (url.href === PROFILE_URL) {
        requests.push({ method: request.method(), headers: await request.allHeaders() })
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            ok: true,
            profile: {
              network: {
                city: "Fixture City",
                region: "Fixture Region",
                country: "Fixture Country",
                latitude: 40,
                longitude: -100,
                accuracyRadiusKm: null
              }
            }
          })
        })
      }
      if (
        request.method() === "GET" &&
        url.origin === "https://api.mapbox.com" &&
        url.pathname === "/styles/v1/mapbox/light-v11/static/pin-l+b3372b(-100,40)/-100,40,11/480x240@2x" &&
        [...url.searchParams.keys()].join(",") === "access_token" &&
        Boolean(url.searchParams.get("access_token"))
      ) {
        maps.push("fixture-coordinate static image")
        return route.fulfill({
          contentType: "image/png",
          body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6fZsAAAAASUVORK5CYII=", "base64")
        })
      }
      denied.push(url.origin)
      return route.abort("blockedbyclient")
    })
    await withFixtureServer("<h1>Local profile transport fixture</h1>", async (baseUrl) => {
      const fixturePage = await context.newPage()
      await fixturePage.goto(baseUrl)
      await expect.poll(async () => (await readAllEvents(worker)).some((event) => event.eventType === "browser_surface")).toBe(true)
      const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({})).find((tab) => tab.url?.startsWith(url))?.id, baseUrl)
      expect(tabId).toBeDefined()
      const report = await context.newPage()
      await report.goto(`chrome-extension://${extensionId}/tabs/report.html?tabId=${tabId}&view=evidence`)
      await expect(report.getByRole("button", { name: "Show me on a map" })).toBeVisible()
      expect(requests).toHaveLength(0)
      expect(maps).toHaveLength(0)
      await report.getByRole("button", { name: "Show me on a map" }).click()
      await expect(report.getByText("Fixture City, Fixture Region, Fixture Country")).toBeVisible()
      expect(requests).toHaveLength(1)
      expect(requests[0]?.method).toBe("GET")
      expect(requests[0]?.headers.cookie).toBeUndefined()
      expect(requests[0]?.headers.authorization).toBeUndefined()
      const mapImage = report.getByRole("img", { name: "Approximate map location near Fixture City, Fixture Region, Fixture Country" })
      const imageCount = await mapImage.count()
      expect(imageCount).toBeLessThanOrEqual(1)
      if (imageCount === 1) await expect(mapImage).toHaveJSProperty("naturalWidth", 1)
      expect(maps).toHaveLength(imageCount)
      expect(denied).toEqual([])
      await test.info().attach("profile-transport.json", {
        body: JSON.stringify(
          {
            passed: true,
            scope: "built extension report, intercepted synthetic profile; no production geo or TLS",
            url: PROFILE_URL,
            requests: requests.length,
            method: requests[0]?.method,
            origin: requests[0]?.headers.origin ?? null,
            cookiesOmitted: requests[0]?.headers.cookie === undefined,
            authorizationOmitted: requests[0]?.headers.authorization === undefined,
            optionalMapImages: maps.length,
            denied
          },
          null,
          2
        ),
        contentType: "application/json"
      })
    })
  })
})
