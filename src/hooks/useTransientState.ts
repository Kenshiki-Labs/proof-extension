import { useEffect, useRef, useState } from "react"

// Transient UI flashes ("Copied", "Saved", "Copy failed") that reset to an
// idle value after a delay. Unlike a bare setTimeout in a handler, the timer
// is cleared on unmount, so a flash can never call setState on a dead
// component — and a second flash replaces the pending reset instead of
// racing it.
export function useTransientState<T>(idleValue: T) {
  const [value, setValue] = useState<T>(idleValue)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function flash(next: T, durationMs = 2000) {
    if (timer.current) clearTimeout(timer.current)
    setValue(next)
    timer.current = setTimeout(() => setValue(idleValue), durationMs)
  }

  return [value, flash] as const
}
