import type { ReactNode } from "react"

import { TYPE } from "./tokens"

// The collapsed-by-default pattern (native <details>) that was copy-pasted
// across popup and report with slightly different summary styling each time.
export default function Disclosure({
  summary,
  labelStyle = "small",
  className = "mt-4",
  defaultOpen = false,
  children
}: {
  summary: ReactNode
  labelStyle?: "small" | "label"
  className?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details className={className} open={defaultOpen || undefined}>
      <summary className={`cursor-pointer select-none ${labelStyle === "label" ? TYPE.label : `${TYPE.small} text-muted-foreground`}`}>
        {summary}
      </summary>
      {children}
    </details>
  )
}
