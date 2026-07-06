import { buildCookieObservedEvent, type ObservedCookieMetadata } from "~core/signals/cookie-observer"
import type { CookieMetadataScanResult } from "~core/domain/types"

type CookiePermissionApi = {
  contains: (permissions: chrome.permissions.Permissions, callback: (granted: boolean) => void) => void
  request: (permissions: chrome.permissions.Permissions, callback: (granted: boolean) => void) => void
}

type CookieApi = {
  getAll: (details: chrome.cookies.GetAllDetails, callback: (cookies: chrome.cookies.Cookie[]) => void) => void
}

export type CookieStoreChromeApi = {
  cookies?: CookieApi | undefined
  permissions?: CookiePermissionApi | undefined
  runtime?: { lastError?: { message?: string } | undefined } | undefined
}

const COOKIE_PERMISSION: chrome.permissions.Permissions = { permissions: ["cookies"] }

function cookieStoreApi(api: CookieStoreChromeApi | undefined): { cookies: CookieApi; permissions: CookiePermissionApi } | null {
  if (!api?.cookies?.getAll || !api.permissions?.contains || !api.permissions.request) return null
  return { cookies: api.cookies, permissions: api.permissions }
}

function permissionCall(
  api: CookieStoreChromeApi,
  call: (callback: (granted: boolean) => void) => void
): Promise<boolean> {
  return new Promise((resolve) => {
    call((granted) => {
      if (api.runtime?.lastError) {
        resolve(false)
        return
      }
      resolve(granted)
    })
  })
}

export async function hasCookieMetadataPermission(api: CookieStoreChromeApi | undefined = globalThis.chrome): Promise<boolean> {
  const storeApi = cookieStoreApi(api)
  if (!storeApi) return false
  return permissionCall(api, (callback) => storeApi.permissions.contains(COOKIE_PERMISSION, callback))
}

export async function requestCookieMetadataPermission(api: CookieStoreChromeApi | undefined = globalThis.chrome): Promise<boolean> {
  const storeApi = cookieStoreApi(api)
  if (!storeApi) return false
  return permissionCall(api, (callback) => storeApi.permissions.request(COOKIE_PERMISSION, callback))
}

function readCookiesForDomain(api: CookieStoreChromeApi, domain: string): Promise<chrome.cookies.Cookie[]> {
  const storeApi = cookieStoreApi(api)
  if (!storeApi) return Promise.resolve([])

  return new Promise((resolve) => {
    storeApi.cookies.getAll({ domain }, (cookies) => {
      if (api.runtime?.lastError) {
        resolve([])
        return
      }
      resolve(cookies)
    })
  })
}

function toObservedCookieMetadata(cookie: Pick<chrome.cookies.Cookie, "name" | "domain" | "secure" | "httpOnly" | "session" | "sameSite">): ObservedCookieMetadata {
  return {
    name: cookie.name,
    domain: cookie.domain,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    session: cookie.session,
    sameSite: cookie.sameSite
  }
}

export async function scanSiteCookieMetadata({
  api = globalThis.chrome,
  observedAt = Date.now(),
  origin,
  tabId
}: {
  api?: CookieStoreChromeApi | undefined
  observedAt?: number | undefined
  origin: string
  tabId: number
}): Promise<CookieMetadataScanResult> {
  const storeApi = cookieStoreApi(api)
  if (!storeApi) return { status: "unsupported", events: [] }

  if (!(await hasCookieMetadataPermission(api))) return { status: "permission_required", events: [] }

  let hostname: string
  try {
    const url = new URL(origin)
    if (url.protocol !== "http:" && url.protocol !== "https:") return { status: "restricted_page", events: [] }
    hostname = url.hostname
  } catch {
    return { status: "restricted_page", events: [] }
  }

  const cookies = await readCookiesForDomain(api, hostname)
  const events = cookies
    .map((cookie) => buildCookieObservedEvent({ cookie: toObservedCookieMetadata(cookie), tabId, origin, observedAt }))
    .filter((event) => event !== null)
    .map((event) => ({ ...event, source: "extension-scan" as const }))

  return { status: "available", events }
}