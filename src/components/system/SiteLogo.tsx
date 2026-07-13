import fingerprintMark from "data-base64:../../../assets/fingerprint-50.png"

type SiteLogoProps = {
  textClass?: string
  sublabel?: string
}

export default function SiteLogo({ textClass = "text-base", sublabel }: SiteLogoProps) {
  return (
    <div className="inline-flex min-w-0 items-center gap-2.5 leading-none">
      <img src={fingerprintMark} alt="" aria-hidden="true" className="h-7 w-7 shrink-0" />
      <div className="min-w-0">
        <span className={`block font-display font-semibold tracking-tight text-foreground ${textClass}`}>
          Proof You Are <span className="text-signal">Human</span>
        </span>
        {sublabel ? (
          <span className="mt-1 block font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted-foreground">{sublabel}</span>
        ) : null}
      </div>
    </div>
  )
}
