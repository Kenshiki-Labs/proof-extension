import { buildCookieObservedEvent, cookieMatchesOrigin, type ObservedCookieMetadata } from "~core/signals/cookie-observer"
import type { CookieMetadataScanResult, CookieValueInspectEntry, CookieValueInspectResult, ObserverEvent } from "~core/domain/types"

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
  runtime?: { lastError?: { message?: string | undefined } | undefined } | undefined
}

const COOKIE_PERMISSION: chrome.permissions.Permissions = { permissions: ["cookies"] }

function defaultChromeApi(): CookieStoreChromeApi | undefined {
  return typeof chrome === "undefined" ? undefined : chrome
}

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

export async function hasCookieMetadataPermission(api: CookieStoreChromeApi | undefined = defaultChromeApi()): Promise<boolean> {
  const storeApi = cookieStoreApi(api)
  if (!api || !storeApi) return false
  return permissionCall(api, (callback) => storeApi.permissions.contains(COOKIE_PERMISSION, callback))
}

export async function requestCookieMetadataPermission(api: CookieStoreChromeApi | undefined = defaultChromeApi()): Promise<boolean> {
  const storeApi = cookieStoreApi(api)
  if (!api || !storeApi) return false
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

function parseInspectableOrigin(origin: string): { hostname: string } | null {
  try {
    const url = new URL(origin)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return { hostname: url.hostname }
  } catch {
    return null
  }
}

function toCookieValueInspectEntry(cookie: chrome.cookies.Cookie): CookieValueInspectEntry {
  return {
    domain: cookie.domain,
    expirationDate: cookie.expirationDate,
    httpOnly: cookie.httpOnly,
    name: cookie.name,
    path: cookie.path,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
    session: cookie.session,
    value: cookie.value
  }
}

export async function scanSiteCookieMetadata({
  api = defaultChromeApi(),
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
  if (!api || !storeApi) return { status: "unsupported", events: [] }

  if (!(await hasCookieMetadataPermission(api))) return { status: "permission_required", events: [] }

  const inspectableOrigin = parseInspectableOrigin(origin)
  if (!inspectableOrigin) return { status: "restricted_page", events: [] }

  const cookies = await readCookiesForDomain(api, inspectableOrigin.hostname)
  const events = cookies
    .map((cookie) => buildCookieObservedEvent({ cookie: toObservedCookieMetadata(cookie), tabId, origin, observedAt }))
    .filter((event): event is ObserverEvent => event !== null)

  return { status: "available", events }
}

export async function inspectSiteCookieValues({
  api = defaultChromeApi(),
  origin
}: {
  api?: CookieStoreChromeApi | undefined
  origin: string
}): Promise<CookieValueInspectResult> {
  const storeApi = cookieStoreApi(api)
  if (!api || !storeApi) return { status: "unsupported", cookies: [] }

  if (!(await hasCookieMetadataPermission(api))) return { status: "permission_required", cookies: [] }

  const inspectableOrigin = parseInspectableOrigin(origin)
  if (!inspectableOrigin) return { status: "restricted_page", cookies: [] }

  const cookies = await readCookiesForDomain(api, inspectableOrigin.hostname)
  return {
    status: "available",
    cookies: cookies.filter((cookie) => cookieMatchesOrigin(cookie.domain, origin)).map(toCookieValueInspectEntry)
  }
}
