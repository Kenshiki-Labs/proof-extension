import type { ReactNode } from "react"

import { SPACE, TYPE } from "./tokens"

export default function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className={SPACE.section}>
      <h2 className={TYPE.label}>{title}</h2>
      {description ? <p className={`${TYPE.small} ${SPACE.stack}`}>{description}</p> : null}
      <div className={SPACE.stack}>{children}</div>
    </section>
  )
}
