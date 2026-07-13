import type { BlockabilityClass, ObservationStatus } from "./types"

type StatusContext = {
  blocked?: boolean
  mitigated?: boolean
}

export function resolveBlockabilityStatus(blockability: BlockabilityClass, context: StatusContext = {}): ObservationStatus {
  if (blockability === "network_blockable") return context.blocked ? "blocked" : "active"
  if (blockability === "content_mitigatable") return context.mitigated ? "mitigated" : "active"
  if (blockability === "pre_request_unblockable") return "cannot_block"
  if (blockability === "server_side_unblockable") return "cannot_block"
  return "active"
}
