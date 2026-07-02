// Anti-bot vendors (Akamai, PerimeterX/HUMAN, DataDome, Kasada, Cloudflare
// Bot Management) commonly probe whether canvas/audio/WebGL APIs have been
// hooked by calling Function.prototype.toString.call(fn) and checking for
// "[native code]". A naive `fn.toString = () => "..."` override does NOT
// defeat that check — `.call()` invokes the real Function.prototype.toString
// directly against `fn`, bypassing any own-property override entirely.
//
// The only way to spoof that path from JS is to intercept
// Function.prototype.toString itself: keep the real implementation for
// everything, but return a native-looking string for functions we've
// patched. This is the same technique used by browser-automation stealth
// plugins for this exact reason.
const nativeLookingNames = new WeakMap<object, string>()
const realFunctionToString = Function.prototype.toString

let installed = false

function installGlobalSpoof() {
  if (installed) return
  installed = true

  Function.prototype.toString = function spoofedToString(this: object) {
    const name = nativeLookingNames.get(this)
    if (name !== undefined) return `function ${name}() { [native code] }`
    return realFunctionToString.call(this)
  }
}

// Wraps a replacement function so it reports as native code under both
// `fn.toString()` and the more robust `Function.prototype.toString.call(fn)`.
export function makeLookNative<T extends (...args: never[]) => unknown>(fn: T, name: string): T {
  installGlobalSpoof()
  Object.defineProperty(fn, "name", { value: name, configurable: true })
  nativeLookingNames.set(fn, name)
  return fn
}
