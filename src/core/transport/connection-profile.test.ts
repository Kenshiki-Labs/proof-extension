import { describe, expect, it, vi } from "vitest"

import { CONNECTION_PROFILE_URL, requestConnectionProfile } from "./connection-profile"

const location = { city: "Fixture City", region: null, country: "Fixture Country", latitude: 40, longitude: -100, accuracyRadiusKm: null }
const envelope = { ok: true, profile: { network: { ...location, isp: "Synthetic ASN", ip: "unused" }, ip: "unused" } }

function sender(response: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(response)
}

describe("explicit connection profile transport", () => {
  it("dispatches only the fixed simple credential-free GET and projects the required display fields", async () => {
    const send = sender(Response.json(envelope))
    const signal = new AbortController().signal
    await expect(requestConnectionProfile(signal, send)).resolves.toEqual(location)
    expect(CONNECTION_PROFILE_URL).toBe("https://gateway.kenshikilabs.com/services/bond/api/session-profile")
    expect(send).toHaveBeenCalledExactlyOnceWith(CONNECTION_PROFILE_URL, {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      mode: "cors",
      cache: "no-store",
      signal
    })
  })

  it.each([401, 403, 404, 500])("does not accept a success-shaped body with HTTP%s or retry", async (status) => {
    const send = sender(Response.json(envelope, { status }))
    await expect(requestConnectionProfile(new AbortController().signal, send)).rejects.toThrow("unavailable")
    expect(send).toHaveBeenCalledTimes(1)
  })

  it.each([
    { network: location },
    { profile: { network: location } },
    { ok: false, profile: { network: location } },
    { ok: true, profile: null },
    { ok: true, profile: { network: { ...location, latitude: null, longitude: null } } },
    { ok: true, profile: { network: { ...location, latitude: 91 } } },
    { ok: true, profile: { network: { ...location, longitude: -181 } } },
    { ok: true, profile: { network: { ...location, latitude: "40" } } },
    { ok: true, profile: { network: { ...location, accuracyRadiusKm: 10 } } }
  ])("refuses absent, foreign or invalid geography without inventing a location: %j", async (body) => {
    await expect(requestConnectionProfile(new AbortController().signal, sender(Response.json(body)))).rejects.toThrow()
  })

  it("rejects nonfinite values even from a malformed injected response without logging them", async () => {
    const response = Response.json(envelope)
    vi.spyOn(response, "json").mockResolvedValue({ ok: true, profile: { network: { ...location, latitude: Infinity } } })
    await expect(requestConnectionProfile(new AbortController().signal, sender(response))).rejects.toThrow()
  })

  it("propagates invalid JSON and refuses an already followed redirect", async () => {
    await expect(requestConnectionProfile(new AbortController().signal, sender(new Response("invalid")))).rejects.toThrow()
    const response = Response.json(envelope)
    Object.defineProperty(response, "redirected", { value: true })
    await expect(requestConnectionProfile(new AbortController().signal, sender(response))).rejects.toThrow("unavailable")
  })

  it("propagates redirect/transport refusal with no alternate host or retry", async () => {
    const refusal = new TypeError("Synthetic transport refusal")
    const send = vi.fn<typeof fetch>().mockRejectedValue(refusal)
    await expect(requestConnectionProfile(new AbortController().signal, send)).rejects.toBe(refusal)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("does not dispatch an already aborted reveal", async () => {
    const controller = new AbortController()
    controller.abort()
    const send = sender(Response.json(envelope))
    await expect(requestConnectionProfile(controller.signal, send)).rejects.toMatchObject({ name: "AbortError" })
    expect(send).not.toHaveBeenCalled()
  })

  it("refuses a noncooperative transport's late response after cancellation before reading the body", async () => {
    const controller = new AbortController()
    const response = Response.json(envelope)
    const json = vi.spyOn(response, "json")
    let settle: ((value: Response) => void) | undefined
    const send = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve
        })
    )
    const result = requestConnectionProfile(controller.signal, send)
    controller.abort()
    settle?.(response)
    await expect(result).rejects.toMatchObject({ name: "AbortError" })
    expect(json).not.toHaveBeenCalled()
  })

  it("refuses a late parsed body when cancellation occurs during JSON reading", async () => {
    const controller = new AbortController()
    const response = Response.json(envelope)
    vi.spyOn(response, "json").mockImplementation(async () => {
      controller.abort()
      return envelope
    })
    await expect(requestConnectionProfile(controller.signal, sender(response))).rejects.toMatchObject({ name: "AbortError" })
  })
})
