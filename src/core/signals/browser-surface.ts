import type { ObserverEvent } from "~core/domain/types"

export type BrowserSurfaceEvent = Omit<ObserverEvent, "tabId">

type NavigatorWithExposureHints = Navigator & {
  connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
  mozConnection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
  webkitConnection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
  deviceMemory?: number
}

const EXPOSURE_NOTE = "This is an extension-run exposure scan; it does not prove the current page queried these fields."

function browserSurfaceEvent(origin: string): BrowserSurfaceEvent {
  const navigatorHints = navigator as NavigatorWithExposureHints
  const connection = navigatorHints.connection ?? navigatorHints.mozConnection ?? navigatorHints.webkitConnection
  const languages = Array.isArray(navigator.languages) ? navigator.languages.join(", ") : navigator.language || "unavailable"

  return {
    id: `browser_surface:${origin}:passive`,
    origin,
    observedAt: Date.now(),
    source: "extension-scan",
    firstParty: true,
    policyLabel: "fingerprinting",
    eventType: "browser_surface",
    blockability: "observable_only",
    status: "active",
    confidence: "confirmed",
    evidence: ["Browser APIs exposed passive surface fields to the extension scan.", EXPOSURE_NOTE],
    details: {
      platform: navigator.platform || "unavailable",
      language: navigator.language || "unavailable",
      languages,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unavailable",
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      screen: `${window.screen.width}x${window.screen.height}`,
      pixelRatio: window.devicePixelRatio || 1,
      orientation: window.screen.orientation?.type || (window.innerWidth >= window.innerHeight ? "landscape" : "portrait"),
      cores: navigator.hardwareConcurrency || "unavailable",
      memory: navigatorHints.deviceMemory ? `${navigatorHints.deviceMemory} GB` : "unavailable",
      touchPoints: navigator.maxTouchPoints || 0,
      colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "default",
      networkType: connection?.effectiveType || "unavailable",
      downlink: connection?.downlink ?? "unavailable",
      rtt: connection?.rtt ?? "unavailable",
      saveData: connection?.saveData ?? "unavailable",
      webdriver: navigator.webdriver ? "true" : "false",
      plugins: navigator.plugins ? navigator.plugins.length : "unavailable",
      cookieEnabled: navigator.cookieEnabled ? "true" : "false",
      doNotTrack: navigator.doNotTrack || "unset"
    }
  }
}

export function collectBrowserSurfaceExposure(origin: string): BrowserSurfaceEvent[] {
  return [browserSurfaceEvent(origin)]
}