import { formatBits, formatCandidates, POPULATION_BASE, type NarrowingModel } from "~core/report/narrowing"
import { joinTraits, portraitCloser, portraitTraits } from "~core/report/portrait"
import { TYPE, UI } from "~components/system/tokens"

function compactPopulation(value: number) {
  return value === POPULATION_BASE ? "330,000,000" : formatCandidates(value)
}

// The one location signal the popup can state with ZERO egress: the device's
// own IANA timezone (e.g. "America/Los_Angeles"). Crucially this is a ZONE, not
// a city — "America/Los_Angeles" is the identifier for all of US Pacific time
// (WA, OR, CA), so it must NOT be rendered as "you're in Los Angeles". It's the
// honest tease for the real city, which comes from MaxMind IP geolocation in
// the report, behind the one deliberate, disclosed network call.
function deviceTimezone(model: NarrowingModel): string | null {
  const timezone = model.steps.find((step) => step.key === "timezone")?.detail
  return timezone && timezone.length > 0 ? timezone : null
}

// The mirror performs the product thesis — "the internet met your digital
// self before you did" — so it leads with the introduction and renders the
// surface reads as a described person (core/report/portrait.ts), not an
// inventory. Nothing is hidden by the reframe: every raw read stays
// verbatim behind the disclosure, and the closing line scales with the
// arithmetic so it never claims "it's you" when the model doesn't.
export function NarrowingMirror({ model }: { model: NarrowingModel }) {
  if (model.values.length === 0) return null

  const timezone = deviceTimezone(model)
  const traits = portraitTraits(model.steps)

  return (
    <section className={`mt-3.5 ${UI.panel} ${UI.inset}`}>
      <p className={TYPE.label}>This page just met your digital self</p>
      {model.steps.length > 0 ? (
        <>
          <p className="mt-2 text-sm leading-snug text-foreground">
            Before you read a word, it could already describe someone: {joinTraits(traits)}.
          </p>
          <p className="mt-2 text-sm leading-snug text-foreground">
            That description fits about <strong className="tabular-nums">{compactPopulation(model.remaining)}</strong> of{" "}
            <strong className="tabular-nums">330,000,000</strong> people. {portraitCloser(model.remaining)}
          </p>
        </>
      ) : null}
      {timezone ? (
        <p className={`${TYPE.small} mt-2`}>
          So far, location is only your device's own clock — <strong>{timezone}</strong>, a whole time zone. Your IP narrows that to a city on a map. The full report shows you that meeting too.
        </p>
      ) : null}
      <details className="mt-2">
        <summary className={`${TYPE.small} cursor-pointer select-none`}>Show the raw reads</summary>
        {/* flex-wrap, not inline text: the value spans carry no whitespace
            between them, so an inline run has no break opportunities and
            overflows. Flex items wrap between chunks; each value stays intact
            (whitespace-nowrap) and long reads (the GPU string) are trimmed for
            the glance so no single chunk exceeds the panel — full value on
            hover, untrimmed in the report narrowing. */}
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1 font-mono text-xs leading-6 text-foreground">
          {model.values.map((value, index) => (
            <span className="whitespace-nowrap" key={`${value}:${index}`} title={value}>
              {index > 0 ? <span className="pr-1 text-border">·</span> : null}
              {value.length > 30 ? `${value.slice(0, 29)}…` : value}
            </span>
          ))}
        </div>
      </details>
      {model.hasConsentSignal ? (
        <p className={`${TYPE.small} mt-2 border-l-2 border-amber-700 pl-2`}>This page asked for cookie consent. The readable surface above exists regardless of that answer.</p>
      ) : null}
    </section>
  )
}

export function NarrowingReportSection({ model }: { model: NarrowingModel }) {
  if (model.steps.length === 0) return null

  return (
    <section className={`mt-6 ${UI.panel} ${UI.reportInset}`}>
      <h2 className={TYPE.label}>01 · Who could this still be?</h2>
      <div className="mt-4 divide-y divide-border">
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3 py-2 text-sm">
          <span className="font-semibold">U.S. population</span>
          <span className="text-right font-mono tabular-nums">330,000,000</span>
        </div>
        {model.steps.map((step) => (
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_8rem] gap-3 py-2 text-sm max-sm:grid-cols-[minmax(0,1fr)_8rem]" key={step.key}>
            <span className="min-w-0">
              <strong>{step.label}</strong> <span className="text-muted-foreground">{step.detail}</span>
            </span>
            <span className="text-right font-mono text-xs tabular-nums text-muted-foreground max-sm:hidden">+{formatBits(step.bits)} bits</span>
            <span className="text-right font-mono tabular-nums">{compactPopulation(step.remaining)}</span>
          </div>
        ))}
      </div>
      <p className={`${TYPE.small} mt-3`}>
        Additive estimate using the proof app's narrowing model. Timezone and screen weights are measured from EFF Panopticlick; the rest are conservative estimates.
      </p>
      {model.hasConsentSignal ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className={`${UI.subtlePanel} p-3`}>
            <p className={TYPE.label}>What the banner governs</p>
            <p className={`${TYPE.small} mt-2`}>Cookie and stored-identifier choices.</p>
          </div>
          <div className={`${UI.subtlePanel} border-amber-700/60 p-3`}>
            <p className={TYPE.label}>Taken regardless</p>
            <p className={`${TYPE.small} mt-2`}>The readable browser surface above, plus server-visible request data.</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
