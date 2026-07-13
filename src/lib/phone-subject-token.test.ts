import { beforeEach, describe, expect, it } from "vitest"

import {
  clearPhoneSubjectToken,
  getPhoneSubjectToken,
  setPhoneSubjectToken,
  type PhoneSubjectToken,
  type TokenStorage
} from "./phone-subject-token"

const TOKEN: PhoneSubjectToken = {
  phoneSubjectId: "phone_e723e0b74b1ec6231286c19efd7847e5",
  phoneSubjectIdV1: "psid_v1_2ab87bc4b8f194a6dc0cea49b05735120841fac5ca965ff1a733bd8bd34d00e7",
  enrolled: true,
  provisionedAt: "2026-07-10T20:00:00.000Z"
}

function memoryStorage(): TokenStorage {
  const map = new Map<string, unknown>()
  return {
    async get(key) {
      return map.has(key) ? { [key]: map.get(key) } : {}
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) map.set(k, v)
    },
    async remove(key) {
      map.delete(key)
    }
  }
}

let storage: TokenStorage
beforeEach(() => {
  storage = memoryStorage()
})

describe("phone-subject-token", () => {
  it("round-trips an opaque token through storage", async () => {
    await setPhoneSubjectToken(storage, TOKEN)
    expect(await getPhoneSubjectToken(storage)).toEqual(TOKEN)
  })

  it("returns null when nothing is stored", async () => {
    expect(await getPhoneSubjectToken(storage)).toBeNull()
  })

  it("clears the token", async () => {
    await setPhoneSubjectToken(storage, TOKEN)
    await clearPhoneSubjectToken(storage)
    expect(await getPhoneSubjectToken(storage)).toBeNull()
  })

  it("accepts a not-yet-enrolled token (null legacy id, v1 present)", async () => {
    const t = { ...TOKEN, phoneSubjectId: null, enrolled: false }
    await setPhoneSubjectToken(storage, t)
    expect(await getPhoneSubjectToken(storage)).toEqual(t)
  })

  it("REFUSES to persist a phone-number-like value (Store-safety guard)", async () => {
    await expect(setPhoneSubjectToken(storage, { ...TOKEN, phoneSubjectId: "+12536320909" })).rejects.toThrow(/Store-safety/)
    expect(await getPhoneSubjectToken(storage)).toBeNull()
  })

  it("rejects a bare national-format number in the v1 slot too", async () => {
    await expect(setPhoneSubjectToken(storage, { ...TOKEN, phoneSubjectIdV1: "2536320909" })).rejects.toThrow(/Store-safety/)
  })

  it("ignores a malformed stored value", async () => {
    await storage.set({ "kenshiki.phone_subject_token.v1": { nope: true } })
    expect(await getPhoneSubjectToken(storage)).toBeNull()
  })
})
