import type { ButtonHTMLAttributes } from "react"

const VARIANT = {
  primary: "border-foreground bg-foreground text-background hover:border-signal hover:bg-signal",
  secondary: "border-border bg-card text-foreground hover:border-foreground hover:bg-background",
  danger: "border-danger bg-card text-danger hover:bg-danger hover:text-background"
}

export default function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT }) {
  return (
    <button
      type="button"
      className={`min-h-9 border px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT[variant]} ${className}`}
      {...props}
    />
  )
}
