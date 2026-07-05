import type { ReactNode } from "react"

// The rounded status/tier/category pill. Previously three private
// implementations (report StatusChip, VerdictBanner tier spans, popup status
// spans) with the same shape and slightly diverging classes. Tones reuse the
// exact class combinations those implementations already used — no new
// visual decisions.
export const CHIP_TONES = {
  danger: "border-danger/60 bg-danger/10 text-danger",
  amber: "border-amber-700/60 bg-amber-700/10 text-amber-700",
  emerald: "border-emerald-700/60 bg-emerald-700/10 text-emerald-700",
  muted: "border-border bg-muted/40 text-muted-foreground"
} as const

export type ChipTone = keyof typeof CHIP_TONES

export default function Chip({ tone = "muted", title, children }: { tone?: ChipTone; title?: string; children: ReactNode }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[0.625rem] uppercase ${CHIP_TONES[tone]}`} title={title}>
      {children}
    </span>
  )
}
