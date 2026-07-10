// The opaque phone-subject token — proof-extension's join key to the Kenshiki verification surface.
//
// Chrome Web Store posture (deliberate): the extension holds ONLY this token. It never receives,
// stores, or transmits a raw phone number, and never holds the worker channel secret. Resolution
// (number -> token) happens SERVER-SIDE in the gate BFF (see pulse-gate-peek/src/lib/phone-subject.ts,
// kenshiki-pulse-worker/docs/phone-subject-id-v1.md); the token is provisioned to the extension
// out of band. Keeping numbers off the page keeps proof-extension clear of the Store's
// sensitive-data / personal-communications policies — no disclosure prompt, no user entry needed.
//
// Storage is dependency-injected so the logic is pure and unit-testable (the codebase keeps browser
// APIs at the edge). `browserTokenStorage()` lazily loads webextension-polyfill so its
// "only in an extension" guard never runs under vitest/jsdom.

const PHONE_SUBJECT_TOKEN_KEY = "kenshiki.phone_subject_token.v1"

export interface PhoneSubjectToken {
  /** Legacy id currently stamped on check-ins (the join key today); null if the number is unknown. */
  readonly phoneSubjectId: string | null
  /** Canonical HMAC v1 token — always present, deterministic. */
  readonly phoneSubjectIdV1: string
  readonly enrolled: boolean
  /** ISO time the token was provisioned, for staleness decisions. */
  readonly provisionedAt: string
}

/** Minimal slice of browser.storage.local — injected so the module never imports the polyfill. */
export interface TokenStorage {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(key: string): Promise<void>
}

// A canonical phone_subject id is a known prefix + hex digest and nothing else. Allowlisting the
// exact shape (rather than trying to detect numbers) means a raw e164, a bare national number, or
// any other stray value is rejected — a pure-digit phone number is valid hex, so a denylist would
// leak it. `phone_hash_` must be tested before `phone_` since the latter is a prefix of it.
const OPAQUE_TOKEN = /^(psid_v1_|phone_hash_|phone_)[0-9a-f]+$/

export async function setPhoneSubjectToken(
  storage: TokenStorage,
  token: PhoneSubjectToken,
): Promise<void> {
  for (const id of [token.phoneSubjectId, token.phoneSubjectIdV1]) {
    if (id != null && !OPAQUE_TOKEN.test(id)) {
      throw new Error(
        `refusing to store a non-opaque value as a phone-subject token (Store-safety guard): ${id.slice(0, 4)}…`,
      )
    }
  }
  await storage.set({ [PHONE_SUBJECT_TOKEN_KEY]: token })
}

export async function getPhoneSubjectToken(
  storage: TokenStorage,
): Promise<PhoneSubjectToken | null> {
  const stored = await storage.get(PHONE_SUBJECT_TOKEN_KEY)
  const value = stored[PHONE_SUBJECT_TOKEN_KEY]
  return isPhoneSubjectToken(value) ? value : null
}

export async function clearPhoneSubjectToken(storage: TokenStorage): Promise<void> {
  await storage.remove(PHONE_SUBJECT_TOKEN_KEY)
}

/** Runtime adapter over browser.storage.local. Only called inside the extension; the dynamic import
 * keeps the polyfill out of the test/jsdom load path. */
export async function browserTokenStorage(): Promise<TokenStorage> {
  const { default: browser } = await import("webextension-polyfill")
  return {
    get: (key) => browser.storage.local.get(key) as Promise<Record<string, unknown>>,
    set: (items) => browser.storage.local.set(items),
    remove: (key) => browser.storage.local.remove(key),
  }
}

function isPhoneSubjectToken(value: unknown): value is PhoneSubjectToken {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return (
    (v.phoneSubjectId === null || typeof v.phoneSubjectId === "string") &&
    typeof v.phoneSubjectIdV1 === "string" &&
    typeof v.enrolled === "boolean" &&
    typeof v.provisionedAt === "string"
  )
}
