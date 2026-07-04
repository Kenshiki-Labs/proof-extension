import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createCoalescedWriter } from "./coalesced-writer"

describe("createCoalescedWriter", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("coalesces a burst of schedules into one write", async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const writer = createCoalescedWriter(write, 250)

    for (let i = 0; i < 50; i += 1) writer.schedule()
    expect(write).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("writes again for schedules after a flush window", async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const writer = createCoalescedWriter(write, 250)

    writer.schedule()
    await vi.advanceTimersByTimeAsync(250)
    writer.schedule()
    await vi.advanceTimersByTimeAsync(250)

    expect(write).toHaveBeenCalledTimes(2)
  })

  it("flush() writes pending state immediately", async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const writer = createCoalescedWriter(write, 250)

    writer.schedule()
    const flushed = writer.flush()
    await vi.advanceTimersByTimeAsync(0)
    await flushed

    expect(write).toHaveBeenCalledTimes(1)
  })

  it("does not lose a schedule that arrives during an in-flight write", async () => {
    let resolveWrite: (() => void) | undefined
    const write = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve
        })
    )
    const writer = createCoalescedWriter(write, 250)

    writer.schedule()
    await vi.advanceTimersByTimeAsync(250)
    expect(write).toHaveBeenCalledTimes(1)

    // New state arrives while the first write is still on the wire.
    writer.schedule()
    resolveWrite?.()
    await vi.advanceTimersByTimeAsync(250)
    resolveWrite?.()
    await vi.advanceTimersByTimeAsync(0)

    expect(write).toHaveBeenCalledTimes(2)
  })

  it("keeps scheduling after a write failure", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("storage full")).mockResolvedValue(undefined)
    const writer = createCoalescedWriter(write, 250)

    writer.schedule()
    await vi.advanceTimersByTimeAsync(250)
    writer.schedule()
    await vi.advanceTimersByTimeAsync(250)

    expect(write).toHaveBeenCalledTimes(2)
  })

  it("flush() resolves immediately when nothing is pending", async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const writer = createCoalescedWriter(write, 250)

    await expect(writer.flush()).resolves.toBeUndefined()
    expect(write).not.toHaveBeenCalled()
  })
})
