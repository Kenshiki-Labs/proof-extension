import { SPACE, TYPE } from "./tokens"

export default function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className={`flex items-center gap-2 ${SPACE.stack}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-current"
      />
      <span className={TYPE.body}>{label}</span>
    </label>
  )
}
