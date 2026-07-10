import type { LucideIcon } from "lucide-react"

import { registrableDomain } from "~core/domain/party"
import type { ObserverEvent } from "~core/domain/types"
import { titleCase } from "~core/report/display"
import { TYPE, UI } from "~components/system/tokens"

export function domainForOrigin(origin: string): string | null {
  try {
    return registrableDomain(new URL(origin).hostname) || null
  } catch {
    return null
  }
}

export function reportTabId(): number | null {
  const tabId = Number(new URLSearchParams(location.search).get("tabId"))
  return Number.isFinite(tabId) && tabId > 0 ? tabId : null
}

const FOOTER_LINKS = [
  { label: "About", href: "https://kenshikilabs.com" },
  { label: "Privacy", href: "https://proofyouarehuman.com/privacy" },
  { label: "TOS", href: "https://proofyouarehuman.com/terms" }
] as const

// The one Metric tile — the report and the value ledger render the same
// primitive; the icon/tone/description extras only appear when passed.
export function Metric({
  description,
  icon: IconComponent,
  label,
  tone = "muted",
  value
}: {
  description?: string
  icon?: LucideIcon
  label: string
  tone?: "muted" | "signal" | "amber" | "danger"
  value: number | string
}) {
  const toneClass = {
    amber: "text-amber-700",
    danger: "text-danger",
    muted: "text-muted-foreground",
    signal: "text-signal"
  }[tone]

  return (
    <div className={`${UI.metricCard} min-w-0`}>
      {IconComponent ? (
        <div className="flex items-center justify-between gap-3">
          <div className={TYPE.label}>{label}</div>
          <IconComponent aria-hidden className={`h-4 w-4 shrink-0 ${toneClass}`} />
        </div>
      ) : (
        <div className={TYPE.label}>{label}</div>
      )}
      <div className={UI.metricValue}>{value}</div>
      {description ? <p className={`${TYPE.small} mt-2`}>{description}</p> : null}
    </div>
  )
}

export function StatusChip({ status }: { status: ObserverEvent["status"] }) {
  return <span className="inline-flex border border-border bg-background/70 px-2 py-0.5 font-mono text-[0.6875rem] uppercase text-muted-foreground">{titleCase(status)}</span>
}

export function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className={TYPE.body}>None stated.</p>
  return <ul className={`${TYPE.body} list-disc pl-5`}>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
}

export function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <h2 className={TYPE.label}>
      <span className="text-signal">{number}</span>
      <span className="mx-2 text-border">/</span>
      {title}
    </h2>
  )
}

export type ReportView = "evidence" | "local-state" | "contract" | "value" | "debug" | "ai-audit"

export function initialReportView(): ReportView {
  const view = new URLSearchParams(location.search).get("view")
  if (view === "persistence") return "local-state"
  return view === "value" || view === "debug" || view === "contract" || view === "local-state" || view === "ai-audit" ? view : "evidence"
}

export function ReportViewSwitch({ onViewChange, view }: { onViewChange: (view: ReportView) => void; view: ReportView }) {
  const options: Array<{ label: string; value: ReportView }> = [
    { label: "Runtime audit", value: "evidence" },
    { label: "Local state", value: "local-state" },
    { label: "Contract", value: "contract" },
    { label: "Value ledger", value: "value" },
    { label: "Debug data", value: "debug" },
    { label: "AI audit", value: "ai-audit" }
  ]

  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {options.map((option) => (
        <button
          aria-selected={view === option.value}
          className={`border px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] ${view === option.value ? "border-foreground text-foreground" : "border-border text-muted-foreground"}`}
          key={option.value}
          onClick={() => onViewChange(option.value)}
          role="tab"
          type="button">
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function ReportFooter() {
  return (
    <footer className={`${TYPE.small} mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border py-5`}>
      <span>Pulse Observer</span>
      <nav aria-label="Product links" className="flex flex-wrap items-center gap-4">
        {FOOTER_LINKS.map((link) => (
          <a className="underline hover:text-foreground" href={link.href} key={link.href} rel="noreferrer" target="_blank">
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  )
}
