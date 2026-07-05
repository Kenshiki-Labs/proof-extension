import Chip from "~components/system/Chip"
import { FUNCTIONAL_CATEGORY_LABELS, type FunctionalCategory } from "~core/domain/functional-category"

// Category labels render ONLY through this component, only from the
// canonical label map — no surface can hand-type "Advertising" and drift
// from the taxonomy. Deliberately tone-neutral: severity is the tier dot's
// job (see WatcherList); category is classification, not judgment.
export default function CategoryChip({ category }: { category: FunctionalCategory }) {
  return <Chip tone="muted">{FUNCTIONAL_CATEGORY_LABELS[category]}</Chip>
}
