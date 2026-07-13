import { describe, expect, it } from "vitest"

import {
  applyCanvasNoise,
  installCanvasElementReadHooks,
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
    expect(world.observations).toEqual([
      { api: "toDataURL", mitigated: false, details: { api: "toDataURL", width: 64, height: 64 } }
    ])
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
