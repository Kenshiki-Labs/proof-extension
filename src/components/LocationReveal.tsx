import { useState } from "react"

import { TYPE, UI } from "~components/system/tokens"

// The one deliberate egress in the whole extension (docs/surface-contract.md
// "The map"): user-initiated, disclosed, never automatic. Pulse observes
// locally and never phones home — EXCEPT here, at an explicit click, to show
// you the one thing it cannot derive on-device: where your IP actually puts
// you on a map. The disclosure is the point: the trackers on this page did
// exactly this, silently, with no button and no consent. This asks first.
//
// It resolves the CALLER's IP (no IP is sent as a parameter — the endpoint
// reads it from the request), then draws a Mapbox static pin. Approximate,
// from the IP, not GPS — labeled as such, with the geo provider's own
// accuracy radius when it gives one.
//
// The geolocation source is Kenshiki's own MaxMind-backed session-profile
// service (gate.kenshikilabs.com — the same endpoint the proof app calls
// server-side), not a generic free IP API: the two products share one geo
// source (the same lockstep discipline as the entropy model), and MaxMind
// resolves far closer to the real location than a free service that often
// returns a datacenter. Called directly from the user's browser so the
// service reads THEIR IP; overridable to the proof proxy via env.

const PROFILE_ENDPOINT = process.env.PLASMO_PUBLIC_PROFILE_ENDPOINT ?? "https://gate.kenshikilabs.com/api/session-profile"

type GeoNetwork = { city?: string; region?: string; country?: string; latitude?: number; longitude?: number; accuracyRadiusKm?: number }
// The service returns either a bare profile or a { ok, profile } envelope.
type ProfileResponse = { ok?: boolean; profile?: { network?: GeoNetwork } | null; network?: GeoNetwork }

type RevealState = { status: "idle" | "loading" | "error" } | { status: "ready"; geo: GeoNetwork }

const MAPBOX_TOKEN = process.env.PLASMO_PUBLIC_MAPBOX_TOKEN

function mapUrl(lat: number, lng: number) {
  if (!MAPBOX_TOKEN) return null
  const marker = `pin-l+b3372b(${lng},${lat})`
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${marker}/${lng},${lat},11/480x240@2x?access_token=${MAPBOX_TOKEN}`
}

export default function LocationReveal({ watching }: { watching: number }) {
  const [state, setState] = useState<RevealState>({ status: "idle" })

  async function reveal() {
    setState({ status: "loading" })
    try {
      const response = await fetch(PROFILE_ENDPOINT)
      const data = (await response.json()) as ProfileResponse
      const geo = data.profile?.network ?? data.network
      if (!geo || geo.latitude == null || geo.longitude == null) {
        setState({ status: "error" })
        return
      }
      setState({ status: "ready", geo })
    } catch {
      setState({ status: "error" })
    }
  }

  const place = state.status === "ready" ? [state.geo.city, state.geo.region, state.geo.country].filter(Boolean).join(", ") : ""
  const radius = state.status === "ready" && state.geo.accuracyRadiusKm != null ? ` (±${state.geo.accuracyRadiusKm} km)` : ""
  const url = state.status === "ready" && state.geo.latitude != null && state.geo.longitude != null ? mapUrl(state.geo.latitude, state.geo.longitude) : null

  return (
    <div className={`${UI.panel} ${UI.reportInset}`}>
      <h2 className={TYPE.label}>Where your IP puts you on a map</h2>

      {state.status === "idle" ? (
        <>
          <p className={`${TYPE.body} mt-2 max-w-2xl`}>
            Pulse never reaches the network to show you anything — except this, at your click. One request to a location service, which reads your IP the way every server on this page already did. Then it draws the pin.
          </p>
          <button
            className={`mt-3 border border-foreground bg-foreground px-4 py-2 font-mono text-xs uppercase tracking-[0.1em] text-background transition-colors hover:border-signal hover:bg-signal`}
            onClick={() => reveal().catch(() => setState({ status: "error" }))}
            type="button">
            Show me on a map →
          </button>
        </>
      ) : null}

      {state.status === "loading" ? <p className={`${TYPE.body} mt-2`}>Locating from your IP…</p> : null}

      {state.status === "error" ? (
        <p className={`${TYPE.body} mt-2`}>Couldn't reach the location service. The point stands: your IP left on every request here, and any recipient can do this.</p>
      ) : null}

      {state.status === "ready" ? (
        <>
          <p className={`${TYPE.body} mt-2`}>
            Your IP alone puts you near <strong>{place || "an identifiable place"}</strong>
            {radius ? <span className={TYPE.small}>{radius}</span> : null}.
          </p>
          {url ? <img alt={`Approximate map location near ${place}`} className="mt-3 w-full max-w-[480px] rounded border border-border" src={url} /> : null}
          <p className={`${TYPE.small} mt-2`}>
            MaxMind IP geolocation — approximate, not GPS. Every one of the {watching} {watching === 1 ? "company" : "companies"} on this page can do exactly this, and none of them asked.
          </p>
        </>
      ) : null}
    </div>
  )
}
