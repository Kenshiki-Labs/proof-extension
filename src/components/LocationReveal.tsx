import { useEffect, useRef, useState } from "react"

import { TYPE, UI } from "~components/system/tokens"
import { requestConnectionProfile, type ConnectionLocation } from "~core/transport/connection-profile"

// Explicit report action only: the edge observes the connection IP, never GPS.
// A configured Mapbox image is a separate disclosed egress after that action.
type RevealState = { status: "idle" | "loading" | "error" } | { status: "ready"; geo: ConnectionLocation }

const MAPBOX_TOKEN = process.env.PLASMO_PUBLIC_MAPBOX_TOKEN

function mapUrl(lat: number, lng: number) {
  if (!MAPBOX_TOKEN) return null
  const marker = `pin-l+b3372b(${lng},${lat})`
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${marker}/${lng},${lat},11/480x240@2x?access_token=${MAPBOX_TOKEN}`
}

export default function LocationReveal({ watching }: { watching: number }) {
  const [state, setState] = useState<RevealState>({ status: "idle" })

  const activeRequest = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      activeRequest.current?.abort()
      activeRequest.current = null
    },
    []
  )

  async function reveal() {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setState({ status: "loading" })
    try {
      const geo = await requestConnectionProfile(controller.signal)
      if (!controller.signal.aborted && activeRequest.current === controller) setState({ status: "ready", geo })
    } catch {
      if (!controller.signal.aborted && activeRequest.current === controller) setState({ status: "error" })
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null
    }
  }

  const place = state.status === "ready" ? [state.geo.city, state.geo.region, state.geo.country].filter(Boolean).join(", ") : ""
  const url =
    state.status === "ready" && state.geo.latitude != null && state.geo.longitude != null
      ? mapUrl(state.geo.latitude, state.geo.longitude)
      : null

  return (
    <div className={`${UI.panel} ${UI.reportInset}`}>
      <h2 className={TYPE.label}>Where your IP puts you on a map</h2>

      {state.status === "idle" ? (
        <>
          <p className={`${TYPE.body} mt-2 max-w-2xl`}>
            At your click, Kenshiki's location service receives your connection IP. If a map is configured, its approximate coordinates then
            go to Mapbox to draw the pin. Nothing is sent for this reveal before you click.
          </p>
          <button
            className={`mt-3 border border-foreground bg-foreground px-4 py-2 font-mono text-xs uppercase tracking-[0.1em] text-background transition-colors hover:border-signal hover:bg-signal`}
            onClick={reveal}
            type="button">
            Show me on a map →
          </button>
        </>
      ) : null}

      {state.status === "loading" ? <p className={`${TYPE.body} mt-2`}>Locating from your IP…</p> : null}

      {state.status === "error" ? (
        <p className={`${TYPE.body} mt-2`}>
          Couldn't reach the location service. The point stands: your IP left on every request here, and any recipient can do this.
        </p>
      ) : null}

      {state.status === "ready" ? (
        <>
          <p className={`${TYPE.body} mt-2`}>
            Your connection IP puts you approximately near <strong>{place || "an identifiable place"}</strong>.
          </p>
          {url ? (
            <img
              alt={`Approximate map location near ${place}`}
              className="mt-3 w-full max-w-[480px] rounded border border-border"
              src={url}
            />
          ) : null}
          <p className={`${TYPE.small} mt-2`}>
            Cloudflare IP location — approximate, not GPS or a measured accuracy radius. The {watching}{" "}
            {watching === 1 ? "company" : "companies"} on this page also receive connection details with their requests.
          </p>
        </>
      ) : null}
    </div>
  )
}
