import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { TYPE } from "./tokens"

// The one section header both product surfaces use. Popup and report each
// had a private variant (icon-styled SectionHeading vs numbered
// SectionTitle) — same concept, parallel renderers, guaranteed drift. One
// component, two optional markers: an icon (popup style), a number (report
// style). Neither is required.
export default function SurfaceSection({
  number,
  icon: IconComponent,
  title,
  actions,
  className = "mt-4",
  children
}: {
  number?: string
  icon?: LucideIcon
  title: ReactNode
  actions?: ReactNode
  className?: string
  children?: ReactNode
}) {
  const heading = (
    <h2 className={`${TYPE.label} flex items-center gap-1.5`}>
      {IconComponent ? <IconComponent aria-hidden className="h-3 w-3 shrink-0" /> : null}
      {number ? (
        <>
          <span className="text-signal">{number}</span>
          <span className="text-border">/</span>
        </>
      ) : null}
      <span>{title}</span>
    </h2>
  )

  return (
    <section className={className}>
      {actions ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {heading}
          {actions}
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  )
}
