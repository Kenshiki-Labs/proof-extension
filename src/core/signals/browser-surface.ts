import type { ObserverEvent } from "~core/domain/types"

export type BrowserSurfaceEvent = Omit<ObserverEvent, "tabId">

type NavigatorWithExposureHints = Navigator & {
  connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
  mozConnection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
  webkitConnection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
  deviceMemory?: number
}

const EXPOSURE_NOTE = "This is an extension-run exposure scan; it does not prove the current page queried these fields."

// The headline identity probe (docs/identity-probe-spec.md): the GPU renderer
// string names the user's actual hardware ("Apple M2 Pro") with zero
// permission prompt and no mention in any consent flow — the most alarming
// unblockable-and-unconsented read. Runs in the content script's isolated
// world, which shares the DOM, so no main-world injection is needed; the read
// creates its OWN canvas and never touches page state. Egress-forbidden: this
// only reads a value, it never transmits.
//
// Masking is a FINDING, not a gap: hardened browsers and Chrome's Privacy
// Budget return a software renderer (SwiftShader/llvmpipe) or refuse the
// debug extension. When masked, gpuRenderer is reported "unavailable" (so the
// narrowing model excludes it from the bit total via its own hasValue filter)
// and gpuMasked is set true so the report can surface the defense.
// Software renderers only: these mean the browser refused the real GPU
// (Privacy Budget, headless, RFP). A specific hardware string like "Apple M2
// Pro" or bare "Apple GPU" is a real, identifying value and must NOT be
// treated as masked.
const MASKED_RENDERER = /swiftshader|llvmpipe|software|paravirtual|mesa offscreen/i

// FNV-1a 32-bit. Fingerprint reads are stored as a short hash, never the raw
// data URL — the extension keeps a stable identifier for display, not the
// underlying image or audio buffer.
function hash32(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

// Canvas 2D render fingerprint. Rendered TWICE: if the two differ, the browser
// is randomizing per-read (Brave/Tor/RFP) — a defense finding, reported masked
// with no value. jsdom returns no 2D context, so this yields "unavailable"
// there and only produces a real hash in a browser.
function readCanvasHash(): { hash: string; masked: boolean } {
  try {
    if (typeof document === "undefined") return { hash: "unavailable", masked: false }
    const render = (): string | null => {
      const canvas = document.createElement("canvas")
      canvas.width = 240
      canvas.height = 60
      const ctx = canvas.getContext("2d")
      if (!ctx || typeof ctx.fillText !== "function") return null
      ctx.textBaseline = "top"
      ctx.font = "14px 'Arial'"
      ctx.fillStyle = "#f60"
      ctx.fillRect(1, 1, 62, 20)
      ctx.fillStyle = "#069"
      ctx.fillText("Pulse identity ✈", 2, 15)
      ctx.fillStyle = "rgba(102,204,0,0.7)"
      ctx.fillText("Pulse identity ✈", 4, 17)
      return canvas.toDataURL()
    }
    const first = render()
    if (!first) return { hash: "unavailable", masked: false }
    const second = render()
    if (first !== second) return { hash: "unavailable", masked: true }
    return { hash: hash32(first), masked: false }
  } catch {
    return { hash: "unavailable", masked: false }
  }
}

const BASE_FONTS = ["monospace", "sans-serif", "serif"]
const PROBE_FONTS = [
  "Arial",
  "Courier New",
  "Georgia",
  "Times New Roman",
  "Comic Sans MS",
  "Impact",
  "Menlo",
  "Monaco",
  "Segoe UI",
  "Roboto",
  "Ubuntu",
  "Chalkduster",
  "Papyrus",
  "Gill Sans",
  "Optima",
  "Futura",
  "Baskerville",
  "Consolas",
  "Cambria",
  "Calibri",
  "Tahoma",
  "Verdana",
  "Trebuchet MS",
  "Palatino",
  "Garamond",
  "Avenir",
  "Helvetica Neue",
  "Andale Mono",
  "Lucida Console",
  "Courier"
]

// Font enumeration by measurement: a probe font is present if it changes the
// rendered width of a fixed string away from every generic fallback. Reveals
// installed software (design suites, language packs) — no permission, no API
// that asks. jsdom measureText returns 0 for everything, so this yields
// "unavailable" there.
function readFontSummary(): { summary: string; masked: boolean } {
  try {
    if (typeof document === "undefined") return { summary: "unavailable", masked: false }
    const ctx = document.createElement("canvas").getContext("2d")
    if (!ctx || typeof ctx.measureText !== "function") return { summary: "unavailable", masked: false }
    const text = "mmmmmmmmmmlli 0123456789"
    const baseWidth: Record<string, number> = {}
    for (const base of BASE_FONTS) {
      ctx.font = `72px ${base}`
      baseWidth[base] = ctx.measureText(text).width
    }
    if (!BASE_FONTS.some((base) => (baseWidth[base] ?? 0) > 0)) return { summary: "unavailable", masked: false }
    let present = 0
    for (const font of PROBE_FONTS) {
      const detected = BASE_FONTS.some((base) => {
        ctx.font = `72px '${font}', ${base}`
        return ctx.measureText(text).width !== baseWidth[base]
      })
      if (detected) present += 1
    }
    return { summary: `${present} of ${PROBE_FONTS.length} probed`, masked: false }
  } catch {
    return { summary: "unavailable", masked: false }
  }
}

function readGpuRenderer(): { renderer: string; masked: boolean } {
  try {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null
    const gl = (canvas?.getContext("webgl") ?? canvas?.getContext("experimental-webgl")) as WebGLRenderingContext | null
    if (!gl || typeof gl.getExtension !== "function") return { renderer: "unavailable", masked: false }

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info")
    if (!debugInfo) return { renderer: "unavailable", masked: true }

    const renderer = String(gl.getParameter((debugInfo as { UNMASKED_RENDERER_WEBGL: number }).UNMASKED_RENDERER_WEBGL) ?? "").trim()
    if (!renderer) return { renderer: "unavailable", masked: true }
    if (MASKED_RENDERER.test(renderer)) return { renderer: "unavailable", masked: true }
    return { renderer, masked: false }
  } catch {
    return { renderer: "unavailable", masked: false }
  }
}

function browserSurfaceEvent(origin: string): BrowserSurfaceEvent {
  const navigatorHints = navigator as NavigatorWithExposureHints
  const connection = navigatorHints.connection ?? navigatorHints.mozConnection ?? navigatorHints.webkitConnection
  const languages = Array.isArray(navigator.languages) ? navigator.languages.join(", ") : navigator.language || "unavailable"
  const gpu = readGpuRenderer()
  const canvas = readCanvasHash()
  const fonts = readFontSummary()
  const evidence = ["Browser APIs exposed passive surface fields to the extension scan.", EXPOSURE_NOTE]
  if (gpu.renderer !== "unavailable") evidence.unshift(`WebGL named your GPU: ${gpu.renderer}. No permission was requested.`)
  else if (gpu.masked) evidence.unshift("Your browser hid your GPU from this page's WebGL read — most browsers do not.")
  if (canvas.masked) evidence.unshift("Your browser randomizes its canvas fingerprint — a defense most browsers do not have.")

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
    evidence,
    details: {
      platform: navigator.platform || "unavailable",
      language: navigator.language || "unavailable",
      languages,
      gpuRenderer: gpu.renderer,
      gpuMasked: gpu.masked ? "true" : "false",
      canvasHash: canvas.hash,
      canvasMasked: canvas.masked ? "true" : "false",
      fontSummary: fonts.summary,
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
