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

export type CanvasReadApi = "toDataURL" | "toBlob" | "getImageData" | "convertToBlob" | "readPixels"

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
export function applyCanvasNoise(data: Uint8Array | Uint8ClampedArray, seed: number): number {
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

type OffscreenCanvasLike = {
  width: number
  height: number
  getContext(kind: string): Context2DLike | null
}

type OffscreenCanvasPrototypeLike = {
  convertToBlob(...args: unknown[]): unknown
}

// Draws `source` into a fresh 2D context, reads it back with the pre-wrap
// getImageData (so the copy is neither double-noised nor re-reported), noises
// the pixels, and writes them back. Returns the channels touched. Shared by
// the HTMLCanvas and OffscreenCanvas copy paths — they differ only in how the
// blank copy canvas is created, not in how it is noised.
function drawNoisedInto(
  context: Context2DLike,
  source: unknown,
  width: number,
  height: number,
  originalGetImageData: Context2DPrototypeLike["getImageData"],
  seed: number
): number {
  // A tainted canvas throws here — exactly as the page's own original export
  // would have thrown. The caller's catch delegates to the original so the
  // page sees the error it expects, not ours.
  context.drawImage(source, 0, 0)
  const imageData = Reflect.apply(originalGetImageData, context, [0, 0, width, height])
  const touched = applyCanvasNoise(imageData.data, seed)
  context.putImageData(imageData, 0, 0)
  return touched
}

// Builds a noised copy of the canvas for the export APIs (toDataURL/toBlob)
// to read from, so the original canvas the page keeps drawing to is never
// altered. Returns null when a faithful noised copy is impossible (zero-size,
// no 2d context) — callers must then fall back to the original, unnoised read
// rather than break or blank the export. The returned `touched` count is how
// the caller decides whether it may claim mitigation: at a 1-in-64 flip rate,
// a read smaller than ~64 pixels can yield a byte-identical copy, and
// reporting that as "mitigated" would be a forged protection claim — the one
// thing this extension must never do.
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

  const touched = drawNoisedInto(context, canvas, width, height, originalGetImageData, seed)
  return { copy, touched }
}

// The OffscreenCanvas analog of noisedCanvasCopy. OffscreenCanvas has no
// ownerDocument, so the blank copy is made with `new OffscreenCanvas(w, h)`
// (injected as `createOffscreen` so this is unit-testable against a stub).
// Same honesty contract: null on impossible copy, `touched` gates the claim.
function noisedOffscreenCopy(
  canvas: { width: number; height: number },
  createOffscreen: (width: number, height: number) => OffscreenCanvasLike,
  originalGetImageData: Context2DPrototypeLike["getImageData"],
  seed: number
): { copy: OffscreenCanvasLike; touched: number } | null {
  const { width, height } = canvas
  if (!width || !height) return null

  const copy = createOffscreen(width, height)
  const context = copy.getContext("2d")
  if (!context) return null

  const touched = drawNoisedInto(context, canvas, width, height, originalGetImageData, seed)
  return { copy, touched }
}

// Wraps a 2D context prototype's getImageData to noise the returned pixels in
// place when mitigation is enabled. Shared verbatim by the HTMLCanvas and
// OffscreenCanvas 2D contexts — the readback semantics are identical, only the
// prototype differs. Reports the read as api "getImageData" either way.
function wrapContext2DGetImageData(
  proto: Context2DPrototypeLike,
  report: CanvasReadReporter,
  isMitigationEnabled: () => boolean,
  seed: number
): void {
  const originalGetImageData = proto.getImageData
  proto.getImageData = function (this: unknown, ...args: unknown[]) {
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

  wrapContext2DGetImageData(context2dPrototype, report, isMitigationEnabled, seed)

  return true
}

// Main-thread OffscreenCanvas readback hooks: convertToBlob (the async export
// analog of toBlob) and the offscreen 2D context's getImageData. Same honesty
// contract as the element hooks — noise only when the gate is on, claim
// mitigation only when a pixel actually changed, delegate unchanged on any
// throw. Content scripts do not run in worker realms, so this covers only
// OffscreenCanvas used on the main thread; canvas reads inside a Web Worker
// remain unreachable (see options copy and TODO.md).
export function installOffscreenCanvasReadHooks(
  report: CanvasReadReporter,
  isMitigationEnabled: () => boolean,
  seed: number,
  offscreenPrototype: OffscreenCanvasPrototypeLike | null = typeof OffscreenCanvas !== "undefined"
    ? (OffscreenCanvas.prototype as unknown as OffscreenCanvasPrototypeLike)
    : null,
  offscreenContext2dPrototype: Context2DPrototypeLike | null = typeof OffscreenCanvasRenderingContext2D !== "undefined"
    ? (OffscreenCanvasRenderingContext2D.prototype as unknown as Context2DPrototypeLike)
    : null,
  createOffscreen: (width: number, height: number) => OffscreenCanvasLike = (width, height) =>
    new OffscreenCanvas(width, height) as unknown as OffscreenCanvasLike
): boolean {
  if (!offscreenPrototype || !offscreenContext2dPrototype) return false

  const originalGetImageData = offscreenContext2dPrototype.getImageData

  const original = offscreenPrototype.convertToBlob
  offscreenPrototype.convertToBlob = function (this: { width: number; height: number }, ...args: unknown[]) {
    let noised: { copy: OffscreenCanvasLike; touched: number } | null = null
    if (isMitigationEnabled()) {
      try {
        noised = noisedOffscreenCopy(this, createOffscreen, originalGetImageData, seed)
      } catch {
        // Fall through to the original, unnoised read — reported as
        // unmitigated, because it was.
      }
    }
    try {
      report({
        api: "convertToBlob",
        mitigated: (noised?.touched ?? 0) > 0,
        details: { api: "convertToBlob", width: this.width ?? 0, height: this.height ?? 0 }
      })
    } catch {
      /* never let observation break the page's canvas call */
    }
    // convertToBlob returns a Promise; the noised copy is built synchronously
    // above, so we simply delegate and hand the Promise straight back.
    return Reflect.apply(original, noised?.copy ?? this, args)
  }

  wrapContext2DGetImageData(offscreenContext2dPrototype, report, isMitigationEnabled, seed)

  return true
}

// WebGL RGBA/UNSIGNED_BYTE constants — the only readPixels format we noise.
const GL_RGBA = 0x1908
const GL_UNSIGNED_BYTE = 0x1401

type WebglReadPixelsPrototypeLike = {
  readPixels(...args: unknown[]): void
}

// Hooks readPixels on WebGL1 and WebGL2 contexts. Unlike the 2D paths,
// readPixels writes into a caller-supplied out-param buffer rather than
// returning data, so we noise the destination *after* the real read.
//
// Honesty narrowing: applyCanvasNoise assumes a tightly-packed RGBA byte
// layout (stride 4, alpha skipped). readPixels can request RGB (stride 3),
// float/half-float types, or a null buffer (pixel-buffer-object reads). For
// any of those, noising the buffer with the RGBA math would corrupt the read
// AND we could not honestly claim mitigation — so we only noise when the
// format is exactly RGBA/UNSIGNED_BYTE into a byte view, and report every
// other read as unmitigated (which is what it is).
export function installWebglReadHooks(
  report: CanvasReadReporter,
  isMitigationEnabled: () => boolean,
  seed: number,
  gl1Prototype: WebglReadPixelsPrototypeLike | null = typeof WebGLRenderingContext !== "undefined"
    ? (WebGLRenderingContext.prototype as unknown as WebglReadPixelsPrototypeLike)
    : null,
  gl2Prototype: WebglReadPixelsPrototypeLike | null = typeof WebGL2RenderingContext !== "undefined"
    ? (WebGL2RenderingContext.prototype as unknown as WebglReadPixelsPrototypeLike)
    : null
): boolean {
  const wrapReadPixels = (proto: WebglReadPixelsPrototypeLike) => {
    const original = proto.readPixels
    proto.readPixels = function (this: unknown, ...args: unknown[]) {
      // Do the real read first so the page always gets its pixels.
      Reflect.apply(original, this, args)

      const [, , , , format, type, pixels] = args
      let touched = 0
      const canNoise =
        format === GL_RGBA && type === GL_UNSIGNED_BYTE && (pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray)
      if (isMitigationEnabled() && canNoise) {
        try {
          touched = applyCanvasNoise(pixels as Uint8Array, seed)
        } catch {
          /* unnoised buffer stands and is reported as such */
        }
      }
      try {
        const region = pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray ? pixels.length >> 2 : 0
        // mitigated only when a pixel actually changed — never on an RGB,
        // float, or PBO read we deliberately passed through.
        report({ api: "readPixels", mitigated: touched > 0, details: { api: "readPixels", pixels: region } })
      } catch {
        /* never let observation break the page's WebGL call */
      }
    }
  }

  let installed = false
  if (gl1Prototype) {
    wrapReadPixels(gl1Prototype)
    installed = true
  }
  if (gl2Prototype) {
    wrapReadPixels(gl2Prototype)
    installed = true
  }
  return installed
}
