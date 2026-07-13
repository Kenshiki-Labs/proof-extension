import { useEffect, useState } from "react"
import browser from "webextension-polyfill"
import type { Storage } from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/messages"
import type { RollingValuationSummary, ValuationPeriod } from "~core/domain/types"

export function useValuationRollup(initialPeriod: ValuationPeriod = "day") {
  const [period, setPeriod] = useState<ValuationPeriod>(initialPeriod)
  const [rollup, setRollup] = useState<RollingValuationSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    // Stale-response guard: a slow response for the previous period must not
    // land after a fast one for the current period, or the ledger displays
    // one period's dollar totals under another period's selector.
    let cancelled = false

    async function load() {
      const response = await browser.runtime.sendMessage({ type: "GET_VALUATION_ROLLUP", period })
      if (cancelled) return
      const parsed = RuntimeMessageSchema.safeParse(response)
      if (parsed.success && parsed.data.type === "VALUATION_ROLLUP") {
        setRollup(parsed.data.payload)
        setError(null)
        return
      }

      setRollup(null)
      setError("Unable to load local value ledger.")
    }

    load().catch((cause: unknown) => {
      if (cancelled) return
      setRollup(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    })

    // The background ledger keeps growing after this hook's initial fetch —
    // without this listener the rollup (and the Connections graph it feeds)
    // freezes at whatever it was when this surface first mounted.
    function onStorageChanged(changes: Record<string, Storage.StorageChange>, area: string) {
      if (area === "local" && "valuationLedger" in changes) load().catch(() => undefined)
    }

    browser.storage.onChanged.addListener(onStorageChanged)
    return () => {
      cancelled = true
      browser.storage.onChanged.removeListener(onStorageChanged)
    }
  }, [period, reloadKey])

  return { error, period, refresh: () => setReloadKey((value) => value + 1), rollup, setPeriod }
}
