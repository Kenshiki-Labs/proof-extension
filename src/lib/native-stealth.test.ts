import { describe, expect, it } from "vitest"

import { makeLookNative } from "./native-stealth"

describe("makeLookNative", () => {
  it("reports as native code via a naive fn.toString() call", () => {
    const patched = makeLookNative(function patchedThing() {
      return 1
    }, "thing")

    expect(patched.toString()).toBe("function thing() { [native code] }")
  })

  it("reports as native code even via Function.prototype.toString.call(fn) — the bypass a naive fn.toString override can't defeat", () => {
    const patched = makeLookNative(function patchedThing() {
      return 1
    }, "thing")

    expect(Function.prototype.toString.call(patched)).toBe("function thing() { [native code] }")
  })

  it("sets a spoofed name", () => {
    const patched = makeLookNative(function patchedThing() {
      return 1
    }, "thing")

    expect(patched.name).toBe("thing")
  })

  it("leaves unrelated functions' toString behavior untouched", () => {
    function untouched() {
      return 2
    }

    makeLookNative(function patchedThing() {
      return 1
    }, "thing")

    expect(Function.prototype.toString.call(untouched)).toContain("function untouched")
  })

  it("still calls through to the real patched implementation", () => {
    const patched = makeLookNative(function patchedThing() {
      return 42
    }, "thing")

    expect(patched()).toBe(42)
  })
})
