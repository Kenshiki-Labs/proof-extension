import { FlaskConical } from "lucide-react"

import { TYPE, UI } from "~components/system/tokens"

export default function BetaBreadthNotice({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`${compact ? "mt-3.5" : "mt-6"} ${UI.subtlePanel} ${compact ? UI.inset : UI.reportInset}`}>
      <div className="flex items-start gap-2.5">
        <FlaskConical aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
        <div>
          <h2 className={TYPE.label}>Beta coverage note</h2>
          <p className={`${TYPE.small} mt-1`}>
            Pulse Observer is in beta. It names source-backed trackers it recognizes today; some observers may remain unclassified while we
            expand breadth. Treat this as local evidence, not a complete privacy audit.
          </p>
        </div>
      </div>
    </section>
  )
}
