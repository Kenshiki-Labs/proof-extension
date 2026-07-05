export type IdentityDigestObservation = {
  key: string
  details: Record<string, string | number>
}

export type IdentityDigestReporter = (observation: IdentityDigestObservation) => void

type DigestLike = (algorithm: unknown, data: unknown) => unknown
type SubtleCryptoLike = { digest?: DigestLike }
type CryptoLike = { subtle?: SubtleCryptoLike }

function algorithmName(algorithm: unknown): string | null {
  if (typeof algorithm === "string") return algorithm
  if (algorithm && typeof algorithm === "object" && "name" in algorithm && typeof algorithm.name === "string") return algorithm.name
  return null
}

function byteLength(data: unknown): number | null {
  if (data instanceof ArrayBuffer) return data.byteLength
  if (ArrayBuffer.isView(data)) return data.byteLength
  return null
}

export function installIdentityDigestHook(report: IdentityDigestReporter, cryptoTarget: CryptoLike = crypto as unknown as CryptoLike): boolean {
  const subtle = cryptoTarget.subtle
  const original = subtle?.digest
  if (!subtle || typeof original !== "function") return false

  try {
    Object.defineProperty(subtle, "digest", {
      configurable: true,
      value: function digest(this: SubtleCryptoLike, algorithm: unknown, data: unknown) {
        try {
          const name = algorithmName(algorithm)
          const inputBytes = byteLength(data)
          if (name?.toUpperCase() === "SHA-256" && inputBytes !== null) {
            report({ key: `sha-256:${inputBytes}`, details: { algorithm: "SHA-256", inputBytes } })
          }
        } catch {
          /* never break the page's digest call */
        }
        return Reflect.apply(original, this, [algorithm, data])
      }
    })
    return true
  } catch {
    return false
  }
}