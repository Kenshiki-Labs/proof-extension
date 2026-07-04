import { parseCookieWrite } from "~core/signals/persistence"
import type { PersistenceEventType } from "~core/signals/persistence"

// MAIN-world persistence hooks. These wrap storage APIs — document.cookie,
// Web Storage, IndexedDB open/delete, Cache API, service-worker
// registration — which the spec treats as default-on persistence
// observation, distinct from the opt-in canvas/audio/WebGL mitigation hooks
// (those alter results; these only observe metadata and always delegate to
// the original behavior unchanged).
//
// Every wrapper follows the same contract:
// - report first, inside try/catch — a reporting bug must never break the
//   page's own storage call
// - delegate with Reflect.apply on the original, preserving this/args/return
// - never read stored VALUES into the report: names, sizes, and timing only
//
// Installers take their target as a parameter (defaulting to the real
// global) so each can be unit-tested against a stub without a browser.

export type PersistenceObservation = {
  eventType: PersistenceEventType
  // Stable key for event-id derivation: same key = same recurring
  // observation, merged into a count by the background.
  key: string
  details: Record<string, string | number>
}

export type PersistenceReporter = (observation: PersistenceObservation) => void

export function installCookieWriteHook(report: PersistenceReporter, doc: Document = document): boolean {
  const prototype = Object.getPrototypeOf(doc) as Document
  const descriptor =
    Object.getOwnPropertyDescriptor(prototype, "cookie") ?? Object.getOwnPropertyDescriptor(Document.prototype, "cookie")
  if (!descriptor?.set || !descriptor.get || !descriptor.configurable) return false

  const originalSet = descriptor.set
  const originalGet = descriptor.get
  Object.defineProperty(prototype, "cookie", {
    configurable: true,
    enumerable: descriptor.enumerable ?? true,
    get() {
      return Reflect.apply(originalGet, this, [])
    },
    set(value: string) {
      try {
        const metadata = parseCookieWrite(String(value))
        report({
          eventType: "cookie_observed",
          key: metadata.name,
          details: { name: metadata.name, valueBytes: metadata.valueBytes, attributes: metadata.attributes }
        })
      } catch {
        // Never let observation break the page's cookie write.
      }
      Reflect.apply(originalSet, this, [value])
    }
  })
  return true
}

type StorageWindow = Pick<Window, "localStorage" | "sessionStorage">

export function installStorageWriteHooks(
  report: PersistenceReporter,
  win: StorageWindow = window,
  storagePrototype: Storage = Storage.prototype
): boolean {
  const areaOf = (storage: unknown): string | null => {
    // Accessing win.localStorage can itself throw (opaque origins, storage
    // partitioning edge cases) — an unattributable area is not reported.
    try {
      if (storage === win.localStorage) return "localStorage"
      if (storage === win.sessionStorage) return "sessionStorage"
    } catch {
      /* fall through */
    }
    return null
  }

  const wrap = (
    method: "setItem" | "removeItem" | "clear",
    describe: (area: string, args: unknown[]) => PersistenceObservation | null
  ) => {
    const original = storagePrototype[method] as (...args: unknown[]) => unknown
    Object.defineProperty(storagePrototype, method, {
      configurable: true,
      writable: true,
      value: function (this: Storage, ...args: unknown[]) {
        try {
          const area = areaOf(this)
          if (area) {
            const observation = describe(area, args)
            if (observation) report(observation)
          }
        } catch {
          /* never break the page's storage call */
        }
        return Reflect.apply(original, this, args)
      }
    })
  }

  wrap("setItem", (area, args) => {
    const key = String(args[0] ?? "")
    if (!key) return null
    const valueBytes = new TextEncoder().encode(String(args[1] ?? "")).length
    return { eventType: "storage_write", key: `${area}:set:${key}`, details: { area, op: "set", key, valueBytes } }
  })
  wrap("removeItem", (area, args) => {
    const key = String(args[0] ?? "")
    if (!key) return null
    return { eventType: "storage_write", key: `${area}:remove:${key}`, details: { area, op: "remove", key } }
  })
  wrap("clear", (area) => ({ eventType: "storage_write", key: `${area}:clear`, details: { area, op: "clear" } }))
  return true
}

type IndexedDbFactoryLike = { open: (...args: unknown[]) => unknown; deleteDatabase: (...args: unknown[]) => unknown }

export function installIndexedDbHooks(
  report: PersistenceReporter,
  factoryPrototype: IndexedDbFactoryLike | null = typeof IDBFactory !== "undefined"
    ? (IDBFactory.prototype as unknown as IndexedDbFactoryLike)
    : null
): boolean {
  if (!factoryPrototype) return false

  const wrap = (method: "open" | "deleteDatabase", op: "open" | "deleteDatabase") => {
    const original = factoryPrototype[method]
    factoryPrototype[method] = function (this: unknown, ...args: unknown[]) {
      try {
        const database = String(args[0] ?? "")
        if (database) {
          report({ eventType: "indexeddb_access", key: `${op}:${database}`, details: { op, database } })
        }
      } catch {
        /* never break the page's database call */
      }
      return Reflect.apply(original, this, args)
    }
  }

  wrap("open", "open")
  wrap("deleteDatabase", "deleteDatabase")
  return true
}

type CacheStorageLike = Record<"open" | "delete" | "match" | "has", (...args: unknown[]) => unknown>

export function installCacheStorageHooks(
  report: PersistenceReporter,
  cachePrototype: CacheStorageLike | null = typeof CacheStorage !== "undefined"
    ? (CacheStorage.prototype as unknown as CacheStorageLike)
    : null
): boolean {
  if (!cachePrototype) return false

  for (const method of ["open", "delete", "match", "has"] as const) {
    const original = cachePrototype[method]
    if (typeof original !== "function") continue
    cachePrototype[method] = function (this: unknown, ...args: unknown[]) {
      try {
        // caches.match(request) takes a Request/URL, not a cache name — the
        // cache name only exists for open/delete/has. Never stringify the
        // request URL into the report (URLs can carry identifiers).
        const cache = method === "match" ? "(lookup across caches)" : String(args[0] ?? "")
        if (cache) {
          report({ eventType: "cache_storage_access", key: `${method}:${cache}`, details: { op: method, cache } })
        }
      } catch {
        /* never break the page's cache call */
      }
      return Reflect.apply(original, this, args)
    }
  }
  return true
}

type ServiceWorkerContainerLike = { register: (...args: unknown[]) => unknown }

export function installServiceWorkerHook(
  report: PersistenceReporter,
  containerPrototype: ServiceWorkerContainerLike | null = typeof ServiceWorkerContainer !== "undefined"
    ? (ServiceWorkerContainer.prototype as unknown as ServiceWorkerContainerLike)
    : null,
  pageOrigin: string = typeof location !== "undefined" ? location.origin : "unknown"
): boolean {
  if (!containerPrototype) return false

  const original = containerPrototype.register
  containerPrototype.register = function (this: unknown, ...args: unknown[]) {
    try {
      const scriptUrl = String(args[0] ?? "")
      const options = args[1] as { scope?: string } | undefined
      const resolved = new URL(scriptUrl, `${pageOrigin}/`)
      const scopePath = options?.scope
        ? new URL(String(options.scope), `${pageOrigin}/`).pathname
        : resolved.pathname.replace(/[^/]*$/, "")
      report({
        eventType: "service_worker_registered",
        key: scopePath,
        details: { scriptOrigin: resolved.origin, scopePath }
      })
    } catch {
      /* never break the page's registration call */
    }
    return Reflect.apply(original, this, args)
  }
  return true
}

// Installs every hook, each independently guarded — a missing API on one
// surface (or a page that froze a prototype) must not disable the others.
export function installPersistenceHooks(report: PersistenceReporter): void {
  const installers = [
    () => installCookieWriteHook(report),
    () => installStorageWriteHooks(report),
    () => installIndexedDbHooks(report),
    () => installCacheStorageHooks(report),
    () => installServiceWorkerHook(report)
  ]
  for (const install of installers) {
    try {
      install()
    } catch {
      /* an uninstallable surface is simply not observed */
    }
  }
}
