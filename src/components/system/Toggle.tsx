import { SPACE, TYPE } from "./tokens"

export default function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  note
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  note?: string
}) {
  return (
    <label className={`flex items-start gap-2.5 ${SPACE.stack} ${disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-current"
      />
      <span className="min-w-0">
        <span className={`${TYPE.body} block`}>{label}</span>
        {note ? <span className={`${TYPE.small} mt-0.5 block`}>{note}</span> : null}
      </span>
    </label>
  )
}
