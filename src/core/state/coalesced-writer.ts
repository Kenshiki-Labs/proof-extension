// Storage-write coalescing for the background. recordEvent used to await a
// full serialization of every tab summary plus the valuation ledger to
// browser.storage.local on EVERY event — a tracker-heavy page produces
// dozens of events in a burst, each rewriting the whole map. Coalescing
// batches those bursts into one write per window.
//
// The window is deliberately short (250ms): Chromium can suspend an MV3
// service worker, but only after ~30s idle — a pending 250ms flush always
// wins that race. flush() exists for the paths that must not wait (clearing
// data, shutdown) and for tests.

export type CoalescedWriter = {
  schedule: () => void
  // Runs the write immediately if one is pending (or in flight), resolving
  // when storage is consistent with memory.
  flush: () => Promise<void>
}

export function createCoalescedWriter(write: () => Promise<void>, delayMs = 250): CoalescedWriter {
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> | null = null
  let dirty = false

  const run = () => {
    timer = null
    dirty = false
    // Chain onto any in-flight write so two writes never interleave; the
    // later snapshot always serializes after (and therefore over) the earlier.
    inFlight = (inFlight ?? Promise.resolve())
      .then(write)
      .catch(() => undefined)
      .finally(() => {
        inFlight = null
        // A schedule() that arrived mid-write re-arms rather than being lost.
        if (dirty && timer === null) timer = setTimeout(run, delayMs)
      })
  }

  return {
    schedule: () => {
      dirty = true
      if (timer === null && inFlight === null) timer = setTimeout(run, delayMs)
    },
    flush: async () => {
      if (timer !== null) {
        clearTimeout(timer)
        run()
      } else if (dirty && inFlight !== null) {
        // A write is in flight with newer state queued behind it; wait for
        // the chain that run() will re-arm, then flush that too.
        await inFlight
        if (timer !== null) {
          clearTimeout(timer)
          run()
        }
      }
      await (inFlight ?? Promise.resolve())
    }
  }
}
