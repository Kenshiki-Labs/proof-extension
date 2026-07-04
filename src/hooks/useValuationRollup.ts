import { useEffect, useState } from "react"
import browser from "webextension-polyfill"

import { RuntimeMessageSchema } from "~core/contracts/schemas"
import type { RollingValuationSummary, ValuationPeriod } from "~core/domain/types"

export function useValuationRollup(initialPeriod: ValuationPeriod = "day") {
  const [period, setPeriod] = useState<ValuationPeriod>(initialPeriod)
  const [rollup, setRollup] = useState<RollingValuationSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    async function load() {
      const response = await browser.runtime.sendMessage({ type: "GET_VALUATION_ROLLUP", period })
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
      setRollup(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }, [period, reloadKey])

  return { error, period, refresh: () => setReloadKey((value) => value + 1), rollup, setPeriod }
}