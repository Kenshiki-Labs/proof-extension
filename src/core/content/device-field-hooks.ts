// MAIN-world passive fingerprint observation. The active exposure scan
// (browser-surface.ts) answers "what COULD this page read about your device?"
// This hook answers the sharper, more honest question: "what did the page
// ACTUALLY read?" — by wrapping the getters for a handful of high-entropy
// device fields and reporting the first time each is accessed.
//
// Contract, in honesty order:
// - report the FIELD that was read, never its value: the point is to name the
//   behavior, and a value adds entropy to a report that is meant to reduce it
// - report at most once per field per page load (a page reading cores in a
//   loop is one observation, not a storm), and always AFTER returning the real
//   value would be impossible — so report first, inside try/catch, then return
//   the genuine value the page expects
// - only wrap a getter that is configurable; a locked-down field is left
//   exactly as-is (we simply do not observe it) rather than risk throwing
// - never change what the page sees: the wrapped getter returns the original
//   value unchanged. This observes; it does not mitigate or spoof.
// - installers take their targets as parameters (defaulting to the real
//   prototypes) so each can be unit-tested against a stub without a browser

export type DeviceFieldObservation = {
  key: string
  details: Record<string, string | number>
}

export type DeviceFieldReporter = (observation: DeviceFieldObservation) => void

type HostLike = object

// Wraps one accessor property so reads are observed once. Returns true if the
// getter was successfully wrapped, false if the field was absent or locked.
function wrapGetter(host: HostLike | null | undefined, prop: string, reportOnce: (key: string) => void): boolean {
  if (!host) return false
  const descriptor = Object.getOwnPropertyDescriptor(host, prop)
  if (!descriptor || typeof descriptor.get !== "function" || descriptor.configurable === false) return false

  const originalGet = descriptor.get
  try {
    Object.defineProperty(host, prop, {
      configurable: true,
      enumerable: descriptor.enumerable ?? false,
      get(this: unknown) {
        try {
          reportOnce(prop)
        } catch {
          /* observation must never break the page's read */
        }
        return Reflect.apply(originalGet, this, [])
      }
    })
    return true
  } catch {
    return false
  }
}

type DeviceFieldTargets = {
  navigatorPrototype?: HostLike | null
  screenPrototype?: HostLike | null
  intlDateTimeFormat?: { prototype?: { resolvedOptions?: (...args: unknown[]) => { timeZone?: string } } } | null
}

const NAVIGATOR_FIELDS = ["hardwareConcurrency", "deviceMemory", "languages"] as const
const SCREEN_FIELDS = ["width", "height", "colorDepth"] as const

function defaultTargets(): DeviceFieldTargets {
  return {
    navigatorPrototype: typeof Navigator !== "undefined" ? Navigator.prototype : null,
    screenPrototype: typeof Screen !== "undefined" ? Screen.prototype : null,
    intlDateTimeFormat: typeof Intl !== "undefined" ? Intl.DateTimeFormat : null
  }
}

export function installDeviceFieldReadHooks(report: DeviceFieldReporter, targets: DeviceFieldTargets = defaultTargets()): boolean {
  const reported = new Set<string>()
  const reportOnce = (key: string) => {
    if (reported.has(key)) return
    reported.add(key)
    report({ key, details: { field: key } })
  }

  let wrappedAny = false

  for (const field of NAVIGATOR_FIELDS) {
    if (wrapGetter(targets.navigatorPrototype, field, reportOnce)) wrappedAny = true
  }
  for (const field of SCREEN_FIELDS) {
    if (wrapGetter(targets.screenPrototype, field, reportOnce)) wrappedAny = true
  }

  // Time zone is not a getter but a field on the object resolvedOptions()
  // returns. Reading it is THE canonical time-zone fingerprint, while calling
  // resolvedOptions() for date formatting is routine — so we report only when
  // the returned object's timeZone is actually read, not on every call.
  const dtf = targets.intlDateTimeFormat
  const proto = dtf?.prototype
  const originalResolved = proto?.resolvedOptions
  if (proto && typeof originalResolved === "function") {
    try {
      proto.resolvedOptions = function (this: unknown, ...args: unknown[]) {
        const options = Reflect.apply(originalResolved, this, args) as { timeZone?: string }
        try {
          const timeZone = options.timeZone
          Object.defineProperty(options, "timeZone", {
            configurable: true,
            enumerable: true,
            get() {
              reportOnce("timeZone")
              return timeZone
            }
          })
        } catch {
          /* if we cannot re-expose it, leave the options object untouched */
        }
        return options
      }
      wrappedAny = true
    } catch {
      /* leave resolvedOptions as-is if it cannot be wrapped */
    }
  }

  return wrappedAny
}
