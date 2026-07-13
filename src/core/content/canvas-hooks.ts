// MAIN-world canvas read hooks. Unlike the persistence hooks (observe only,
// always delegate unchanged), these are the first Phase 2 mitigation hooks:
// when the user has opted into canvas mitigation, pixel readbacks are
// answered with per-session least-significant-bit noise so the canvas
// fingerprint is unstable across sessions — different, not invisible, and
// the options page says exactly that.
//
// Contract, in honesty order:
// - mitigation is applied ONLY when the isMitigationEnabled() gate is true
//   at call time; the gate reads the settings flag the isolated bridge syncs
//   into the page, so installing the extension alone changes nothing
// - if the noise path fails for any reason, delegate to the original
//   unmodified and report mitigated: false — never claim protection that
//   did not happen (the background additionally refuses "mitigated" status
//   unless the setting is actually on: core/signals/canvas-read.ts)
// - report first, inside try/catch — a reporting bug must never break the
//   page's own canvas call
// - installers take their targets as parameters (defaulting to the real
//   prototypes) so each can be unit-tested against a stub without a browser

export type CanvasReadApi = "toDataURL" | "toBlob" | "getImageData"

export type CanvasReadObservation = {
  api: CanvasReadApi
  mitigated: boolean
  details: Record<string, string | number>
}

export type CanvasReadReporter = (observation: CanvasReadObservation) => void

// One seed per page load: the same canvas read twice in a session must give
// the same noised answer (a per-call random would be trivially detectable by
// diffing two reads), while a new session gives a new fingerprint.
export function createNoiseSeed(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0] ?? 0
}

// Deterministic in (seed, pixel index): flips the least significant bit of
// one color channel on roughly 1 in 64 pixels. Visually invisible, but any
// hash of the pixel data changes. Returns the number of channels touched.
export function applyCanvasNoise(data: Uint8ClampedArray, seed: number): number {
  let touched = 0
  const pixelCount = data.length >> 2
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const hash = (Math.imul(pixel + 1, 2654435761) ^ seed) >>> 0
    if ((hash & 63) !== 0) continue
    const channel = (hash >>> 6) % 3
    data[pixel * 4 + channel] ^= 1
    touched += 1
  }
  return touched
}

type CanvasLike = {
  width: number
  height: number
  ownerDocument?: { createElement(tag: string): unknown }
}

type Context2DLike = {
  drawImage(source: unknown, x: number, y: number): void
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray }
  putImageData(data: { data: Uint8ClampedArray }, x: number, y: number): void
}

type CanvasElementPrototypeLike = {
  toDataURL(...args: unknown[]): unknown
  toBlob(...args: unknown[]): unknown
}

type Context2DPrototypeLike = {
  getImageData(...args: unknown[]): { data: Uint8ClampedArray }
}

// Builds a noised copy of the canvas for the export APIs (toDataURL/toBlob)
// to read from, so the original canvas the page keeps drawing to is never
// altered. Uses the pre-wrap getImageData so the copy itself is not
// double-noised or re-reported. Returns null when a faithful noised copy is
// impossible (zero-size, no 2d context) — callers must then fall back to
// the original, unnoised read rather than break or blank the export. The
// returned `touched` count is how the caller decides whether it may claim
// mitigation: at a 1-in-64 flip rate, a read smaller than ~64 pixels can
// yield a byte-identical copy, and reporting that as "mitigated" would be a
// forged protection claim — the one thing this extension must never do.
function noisedCanvasCopy(
  canvas: CanvasLike,
  originalGetImageData: Context2DPrototypeLike["getImageData"],
  seed: number
): { copy: CanvasLike; touched: number } | null {
  const { width, height } = canvas
  if (!width || !height || !canvas.ownerDocument) return null

  const copy = canvas.ownerDocument.createElement("canvas") as CanvasLike & {
    getContext(kind: string): Context2DLike | null
  }
  copy.width = width
  copy.height = height
  const context = copy.getContext("2d")
  if (!context) return null

  context.drawImage(canvas, 0, 0)
  // A tainted canvas throws here — exactly as the page's own original
  // toDataURL would have thrown. The caller's catch delegates to the
  // original so the page sees the error it expects, not ours.
  const imageData = Reflect.apply(originalGetImageData, context, [0, 0, width, height])
  const touched = applyCanvasNoise(imageData.data, seed)
  context.putImageData(imageData, 0, 0)
  return { copy, touched }
}

export function installCanvasElementReadHooks(
  report: CanvasReadReporter,
  isMitigationEnabled: () => boolean,
  seed: number,
  canvasPrototype: CanvasElementPrototypeLike | null = typeof HTMLCanvasElement !== "undefined"
    ? (HTMLCanvasElement.prototype as unknown as CanvasElementPrototypeLike)
    : null,
  context2dPrototype: Context2DPrototypeLike | null = typeof CanvasRenderingContext2D !== "undefined"
    ? (CanvasRenderingContext2D.prototype as unknown as Context2DPrototypeLike)
    : null
): boolean {
  if (!canvasPrototype || !context2dPrototype) return false

  const originalGetImageData = context2dPrototype.getImageData

  const wrapExport = (method: "toDataURL" | "toBlob") => {
    const original = canvasPrototype[method]
    canvasPrototype[method] = function (this: CanvasLike, ...args: unknown[]) {
      let noised: { copy: CanvasLike; touched: number } | null = null
      if (isMitigationEnabled()) {
        try {
          noised = noisedCanvasCopy(this, originalGetImageData, seed)
        } catch {
          // Fall through to the original, unnoised read — and report it as
          // unmitigated, because it was.
        }
      }
      try {
        report({
          api: method,
          // Only claim mitigation when noise actually changed a pixel; a
          // byte-identical copy (too small to hit the flip rate) is reported
          // honestly as unmitigated.
          mitigated: (noised?.touched ?? 0) > 0,
          details: { api: method, width: this.width ?? 0, height: this.height ?? 0 }
        })
      } catch {
        /* never let observation break the page's canvas call */
      }
      return Reflect.apply(original, noised?.copy ?? this, args)
    }
  }

  wrapExport("toDataURL")
  wrapExport("toBlob")

  context2dPrototype.getImageData = function (this: unknown, ...args: unknown[]) {
    const result = Reflect.apply(originalGetImageData, this, args)
    let touched = 0
    if (isMitigationEnabled()) {
      try {
        touched = applyCanvasNoise(result.data, seed)
      } catch {
        /* unnoised result is returned and reported as such */
      }
    }
    try {
      const region = result.data ? result.data.length >> 2 : 0
      // mitigated only when a pixel actually changed — see wrapExport.
      report({ api: "getImageData", mitigated: touched > 0, details: { api: "getImageData", pixels: region } })
    } catch {
      /* never let observation break the page's canvas call */
    }
    return result
  }

  return true
}
