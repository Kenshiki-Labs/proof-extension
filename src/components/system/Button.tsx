import type { ButtonHTMLAttributes } from "react"

const VARIANT = {
  primary: "border-foreground text-foreground hover:bg-foreground hover:text-background",
  danger: "border-danger text-danger hover:bg-danger hover:text-background"
}

export default function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT }) {
  return (
    <button
      type="button"
      className={`border px-3 py-1.5 font-mono text-xs uppercase tracking-[0.08em] transition-colors disabled:opacity-40 ${VARIANT[variant]} ${className}`}
      {...props}
    />
  )
}
