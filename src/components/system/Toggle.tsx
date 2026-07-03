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
    <label className={`flex items-center gap-2 ${SPACE.stack} ${disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-current"
      />
      <span className={TYPE.body}>{label}</span>
      {note ? <span className={TYPE.small}>{note}</span> : null}
    </label>
  )
}
