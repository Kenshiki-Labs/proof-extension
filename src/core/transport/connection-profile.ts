import { z } from "zod"

export const CONNECTION_PROFILE_URL = "https://gateway.kenshikilabs.com/services/bond/api/session-profile"

const connectionLocationSchema = z.object({
  city: z.string().nullable(),
  region: z.string().nullable(),
  country: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyRadiusKm: z.null()
})
const responseSchema = z.object({
  ok: z.literal(true),
  profile: z.object({ network: connectionLocationSchema })
})

export type ConnectionLocation = z.infer<typeof connectionLocationSchema>

/** Informational connection geography, fetched only after the report's explicit reveal action. */
export async function requestConnectionProfile(signal: AbortSignal, send: typeof fetch = fetch): Promise<ConnectionLocation> {
  signal.throwIfAborted()
  const response = await send(CONNECTION_PROFILE_URL, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    mode: "cors",
    cache: "no-store",
    signal
  })
  signal.throwIfAborted()
  if (!response.ok || response.redirected) throw new Error("Connection profile is unavailable.")
  const data: unknown = await response.json()
  signal.throwIfAborted()
  return responseSchema.parse(data).profile.network
}
