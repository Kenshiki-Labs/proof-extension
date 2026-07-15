import { describe, expect, it } from "vitest"

import {
  applyCanvasNoise,
  installCanvasElementReadHooks,
  installOffscreenCanvasReadHooks,
  installWebglReadHooks,
  type CanvasReadObservation
} from "~core/content/canvas-hooks"

function pixels(count: number, fill = 128): Uint8ClampedArray {
  return new Uint8ClampedArray(count * 4).fill(fill)
}

describe("applyCanvasNoise", () => {
  it("is deterministic for the same seed and differs across seeds", () => {
    const a = pixels(4096)
    const b = pixels(4096)
    const c = pixels(4096)

    const touchedA = applyCanvasNoise(a, 0xdead)
    const touchedB = applyCanvasNoise(b, 0xdead)
    applyCanvasNoise(c, 0xbeef)

    expect(touchedA).toBeGreaterThan(0)
    expect(touchedA).toBe(touchedB)
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(Array.from(a)).not.toEqual(Array.from(c))
  })

  it("only flips least significant bits and never touches alpha", () => {
    const data = pixels(4096, 200)
    applyCanvasNoise(data, 42)

    for (let i = 0; i < data.length; i += 1) {
      if (i % 4 === 3) expect(data[i]).toBe(200)
      else expect([200, 201]).toContain(data[i])
    }
  })

  it("returns 0 and mutates nothing when a read is too small to hit the flip rate", () => {
    // seed 0 on a single pixel: (1*K ^ 0) & 63 = 49 != 0, so no flip.
    const data = pixels(1, 100)
    const before = Array.from(data)
    expect(applyCanvasNoise(data, 0)).toBe(0)
    expect(Array.from(data)).toEqual(before)
  })
})

type StubImageData = { data: Uint8ClampedArray }

function makeStubWorld(pixelCount = 4096) {
  const observations: CanvasReadObservation[] = []
  const source = pixels(pixelCount, 100)

  const makeContext = (backing: Uint8ClampedArray) => ({
    drawImage: (from: { backing: Uint8ClampedArray }) => backing.set(from.backing),
    getImageData: (): StubImageData => ({ data: backing }),
    putImageData: (imageData: StubImageData) => backing.set(imageData.data)
  })

  const makeCanvas = (backing: Uint8ClampedArray) => {
    const canvas = {
      width: 64,
      height: 64,
      backing,
      getContext: (kind: string) => (kind === "2d" ? makeContext(backing) : null),
      ownerDocument: {
        createElement: (tag: string) => (tag === "canvas" ? makeCanvas(new Uint8ClampedArray(backing.length)) : null)
      }
    }
    return canvas
  }

  const canvasPrototype = {
    toDataURL: function (this: { backing: Uint8ClampedArray }) {
      // Stand-in for encoding: the "data URL" is just the backing bytes, so
      // tests can tell exactly which pixels the export read from.
      return Array.from(this.backing).join(",")
    },
    toBlob: function (this: { backing: Uint8ClampedArray }, callback: (value: string) => void) {
      callback(Array.from(this.backing).join(","))
    }
  }

  const context2dPrototype = {
    getImageData: function (this: ReturnType<typeof makeContext>): StubImageData {
      return this.getImageData()
    }
  }

  return { observations, source, makeCanvas, canvasPrototype, context2dPrototype }
}

describe("installCanvasElementReadHooks", () => {
  it("reports without altering the export when mitigation is disabled", () => {
    const world = makeStubWorld()
    installCanvasElementReadHooks(
      (observation) => world.observations.push(observation),
      () => false,
      7,
      world.canvasPrototype as never,
      world.context2dPrototype as never
    )

    const canvas = world.makeCanvas(world.source)
    const exported = world.canvasPrototype.toDataURL.call(canvas as never)

    expect(exported).toBe(Array.from(world.source).join(","))
    expect(world.observations).toEqual([{ api: "toDataURL", mitigated: false, details: { api: "toDataURL", width: 64, height: 64 } }])
  })

  it("answers exports with noised pixels and leaves the original canvas untouched when enabled", () => {
    const world = makeStubWorld()
    installCanvasElementReadHooks(
      (observation) => world.observations.push(observation),
      () => true,
      7,
      world.canvasPrototype as never,
      world.context2dPrototype as never
    )

    const canvas = world.makeCanvas(world.source)
    const before = Array.from(world.source)
    const exported = world.canvasPrototype.toDataURL.call(canvas as never) as string

    expect(exported).not.toBe(Array.from(world.source).join(","))
    expect(Array.from(world.source)).toEqual(before)
    expect(world.observations[0]).toMatchObject({ api: "toDataURL", mitigated: true })
  })

  it("falls back to the unnoised original and reports unmitigated when the noise path fails", () => {
    const world = makeStubWorld()
    installCanvasElementReadHooks(
      (observation) => world.observations.push(observation),
      () => true,
      7,
      world.canvasPrototype as never,
      world.context2dPrototype as never
    )

    // Zero-size canvas: a faithful noised copy is impossible.
    const canvas = world.makeCanvas(world.source)
    canvas.width = 0
    const exported = world.canvasPrototype.toDataURL.call(canvas as never)

    expect(exported).toBe(Array.from(world.source).join(","))
    expect(world.observations[0]).toMatchObject({ api: "toDataURL", mitigated: false })
  })

  it("noises getImageData results in place when enabled and reports pixel count", () => {
    const world = makeStubWorld()
    installCanvasElementReadHooks(
      (observation) => world.observations.push(observation),
      () => true,
      7,
      world.canvasPrototype as never,
      world.context2dPrototype as never
    )

    const backing = pixels(4096, 100)
    const context = { getImageData: () => ({ data: backing }) }
    const result = world.context2dPrototype.getImageData.call(context as never) as StubImageData

    expect(Array.from(result.data)).not.toEqual(Array.from(pixels(4096, 100)))
    expect(world.observations[0]).toMatchObject({
      api: "getImageData",
      mitigated: true,
      details: { api: "getImageData", pixels: 4096 }
    })
  })

  it("does not claim mitigation for an export too small to be noised, and leaves output identical", () => {
    // seed 0 + a 1-pixel canvas flips nothing; the honest report is
    // mitigated:false and the exported bytes must match the original exactly.
    const world = makeStubWorld(1)
    installCanvasElementReadHooks(
      (observation) => world.observations.push(observation),
      () => true,
      0,
      world.canvasPrototype as never,
      world.context2dPrototype as never
    )

    const canvas = world.makeCanvas(world.source)
    const exported = world.canvasPrototype.toDataURL.call(canvas as never)

    expect(exported).toBe(Array.from(world.source).join(","))
    expect(world.observations[0]).toMatchObject({ api: "toDataURL", mitigated: false })
  })

  it("does not claim mitigation for a getImageData read too small to be noised", () => {
    const world = makeStubWorld()
    installCanvasElementReadHooks(
      (observation) => world.observations.push(observation),
      () => true,
      0,
      world.canvasPrototype as never,
      world.context2dPrototype as never
    )

    const backing = pixels(1, 100)
    const context = { getImageData: () => ({ data: backing }) }
    const result = world.context2dPrototype.getImageData.call(context as never) as StubImageData

    expect(Array.from(result.data)).toEqual(Array.from(pixels(1, 100)))
    expect(world.observations[0]).toMatchObject({ api: "getImageData", mitigated: false, details: { pixels: 1 } })
  })

  it("never lets a reporter crash break the page's canvas call", () => {
    const world = makeStubWorld()
    installCanvasElementReadHooks(
      () => {
        throw new Error("reporter bug")
      },
      () => false,
      7,
      world.canvasPrototype as never,
      world.context2dPrototype as never
    )

    const canvas = world.makeCanvas(world.source)
    expect(() => world.canvasPrototype.toDataURL.call(canvas as never)).not.toThrow()
  })
})

// OffscreenCanvas has no ownerDocument; the installer builds its noised copy
// from an injected createOffscreen factory instead. This stub world mirrors
// makeStubWorld but exposes convertToBlob (async) as the export surface.
function makeOffscreenStubWorld(pixelCount = 4096) {
  const observations: CanvasReadObservation[] = []
  const source = pixels(pixelCount, 100)

  const makeContext = (backing: Uint8ClampedArray) => ({
    drawImage: (from: { backing: Uint8ClampedArray }) => backing.set(from.backing),
    getImageData: (): StubImageData => ({ data: backing }),
    putImageData: (imageData: StubImageData) => backing.set(imageData.data)
  })

  const makeOffscreenCanvas = (backing: Uint8ClampedArray, width = 64, height = 64) => ({
    width,
    height,
    backing,
    getContext: (kind: string) => (kind === "2d" ? makeContext(backing) : null)
  })

  const createOffscreen = (width: number, height: number) => makeOffscreenCanvas(new Uint8ClampedArray(width * height * 4), width, height)

  const offscreenPrototype = {
    convertToBlob: function (this: { backing: Uint8ClampedArray }) {
      // Stand-in for encoding: resolve with the backing bytes so a test can
      // see exactly which pixels convertToBlob read from.
      return Promise.resolve(Array.from(this.backing).join(","))
    }
  }

  const offscreenContext2dPrototype = {
    getImageData: function (this: ReturnType<typeof makeContext>): StubImageData {
      return this.getImageData()
    }
  }

  return { observations, source, makeOffscreenCanvas, createOffscreen, offscreenPrototype, offscreenContext2dPrototype }
}

describe("installOffscreenCanvasReadHooks", () => {
  it("reports convertToBlob without altering the export when mitigation is disabled", async () => {
    const world = makeOffscreenStubWorld()
    installOffscreenCanvasReadHooks(
      (observation) => world.observations.push(observation),
      () => false,
      7,
      world.offscreenPrototype as never,
      world.offscreenContext2dPrototype as never,
      world.createOffscreen as never
    )

    const canvas = world.makeOffscreenCanvas(world.source)
    const exported = await world.offscreenPrototype.convertToBlob.call(canvas as never)

    expect(exported).toBe(Array.from(world.source).join(","))
    expect(world.observations).toEqual([
      { api: "convertToBlob", mitigated: false, details: { api: "convertToBlob", width: 64, height: 64 } }
    ])
  })

  it("answers convertToBlob with noised pixels and leaves the original untouched when enabled", async () => {
    const world = makeOffscreenStubWorld()
    installOffscreenCanvasReadHooks(
      (observation) => world.observations.push(observation),
      () => true,
      7,
      world.offscreenPrototype as never,
      world.offscreenContext2dPrototype as never,
      world.createOffscreen as never
    )

    const canvas = world.makeOffscreenCanvas(world.source)
    const before = Array.from(world.source)
    const exported = await world.offscreenPrototype.convertToBlob.call(canvas as never)

    expect(exported).not.toBe(Array.from(world.source).join(","))
    expect(Array.from(world.source)).toEqual(before)
    expect(world.observations[0]).toMatchObject({ api: "convertToBlob", mitigated: true })
  })

  it("noises the offscreen getImageData result in place when enabled", () => {
    const world = makeOffscreenStubWorld()
    installOffscreenCanvasReadHooks(
      (observation) => world.observations.push(observation),
      () => true,
      7,
      world.offscreenPrototype as never,
      world.offscreenContext2dPrototype as never,
      world.createOffscreen as never
    )

    const backing = pixels(4096, 100)
    const context = { getImageData: () => ({ data: backing }) }
    const result = world.offscreenContext2dPrototype.getImageData.call(context as never) as StubImageData

    expect(Array.from(result.data)).not.toEqual(Array.from(pixels(4096, 100)))
    expect(world.observations[0]).toMatchObject({
      api: "getImageData",
      mitigated: true,
      details: { api: "getImageData", pixels: 4096 }
    })
  })

  it("returns false when the OffscreenCanvas APIs are absent", () => {
    expect(
      installOffscreenCanvasReadHooks(
        () => undefined,
        () => true,
        7,
        null,
        null
      )
    ).toBe(false)
  })
})

// WebGL constants used by the readPixels honesty narrowing.
const GL_RGBA = 0x1908
const GL_RGB = 0x1907
const GL_UNSIGNED_BYTE = 0x1401
const GL_FLOAT = 0x1406

function makeWebglStubWorld() {
  const observations: CanvasReadObservation[] = []
  // Stub readPixels: fills the caller's out-param buffer with a constant so a
  // test can tell whether noise later changed it.
  const glPrototype = {
    readPixels: function (this: unknown, ...args: unknown[]) {
      const pixels = args[6]
      if (pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) pixels.fill(100)
    }
  }
  return { observations, glPrototype }
}

describe("installWebglReadHooks", () => {
  it("noises an RGBA/8-bit readPixels buffer in place and reports it mitigated when enabled", () => {
    const world = makeWebglStubWorld()
    installWebglReadHooks(
      (observation) => world.observations.push(observation),
      () => true,
      7,
      world.glPrototype as never,
      null
    )

    const buffer = new Uint8Array(4096 * 4)
    world.glPrototype.readPixels.call({}, 0, 0, 64, 64, GL_RGBA, GL_UNSIGNED_BYTE, buffer)

    expect(Array.from(buffer)).not.toEqual(Array.from(new Uint8Array(4096 * 4).fill(100)))
    expect(world.observations[0]).toMatchObject({ api: "readPixels", mitigated: true, details: { api: "readPixels", pixels: 4096 } })
  })

  it("passes a non-RGBA (RGB) read through unmodified and reports it unmitigated", () => {
    const world = makeWebglStubWorld()
    installWebglReadHooks(
      (observation) => world.observations.push(observation),
      () => true,
      7,
      world.glPrototype as never,
      null
    )

    const buffer = new Uint8Array(4096 * 3)
    world.glPrototype.readPixels.call({}, 0, 0, 64, 64, GL_RGB, GL_UNSIGNED_BYTE, buffer)

    expect(Array.from(buffer)).toEqual(Array.from(new Uint8Array(4096 * 3).fill(100)))
    expect(world.observations[0]).toMatchObject({ api: "readPixels", mitigated: false })
  })

  it("passes a float-type read through unmodified and reports it unmitigated", () => {
    const world = makeWebglStubWorld()
    installWebglReadHooks(
      (observation) => world.observations.push(observation),
      () => true,
      7,
      world.glPrototype as never,
      null
    )

    const buffer = new Uint8Array(4096 * 4)
    world.glPrototype.readPixels.call({}, 0, 0, 64, 64, GL_RGBA, GL_FLOAT, buffer)

    expect(Array.from(buffer)).toEqual(Array.from(new Uint8Array(4096 * 4).fill(100)))
    expect(world.observations[0]).toMatchObject({ api: "readPixels", mitigated: false })
  })

  it("never noises when mitigation is disabled", () => {
    const world = makeWebglStubWorld()
    installWebglReadHooks(
      (observation) => world.observations.push(observation),
      () => false,
      7,
      world.glPrototype as never,
      null
    )

    const buffer = new Uint8Array(4096 * 4)
    world.glPrototype.readPixels.call({}, 0, 0, 64, 64, GL_RGBA, GL_UNSIGNED_BYTE, buffer)

    expect(Array.from(buffer)).toEqual(Array.from(new Uint8Array(4096 * 4).fill(100)))
    expect(world.observations[0]).toMatchObject({ api: "readPixels", mitigated: false })
  })

  it("returns false when neither WebGL prototype is present", () => {
    expect(
      installWebglReadHooks(
        () => undefined,
        () => true,
        7,
        null,
        null
      )
    ).toBe(false)
  })
})
