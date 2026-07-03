# Provenance: Market Research Valuations 2026

- `market-research-2026.json` is the vendored source corpus for per-person valuation findings used by Proof Extension.
- Findings are structured independently from runtime tracker records. A finding names a subject entity and then explicitly projects to one or more tracker ids.
- The initial corpus was generated from the pre-existing runtime `perPersonValue` blocks on 2026-07-03 so promotion can become deterministic without changing shipped valuation bytes.
- Source family: `market_research`.
- Governance: raw source only. Normalized via `pnpm intel:normalize` into `intelligence/normalized/valuations.json`; runtime values are written only by `pnpm intel:promote`.
- `market_research` supports valuation estimates only. It must not be used as evidence for tracker identity, browser collection behavior, ownership, blocking policy, or source-level remediation claims.
