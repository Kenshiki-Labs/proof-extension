# Provenance: defense-ai source files

Vendored from `KenshikiDeviceSDK/spec/defense-ai/` on 2026-07-03. These are raw
import sources under `docs/intelligence-standards.md` governance: they must
not affect runtime blocking or popup claims until normalized, schema-validated,
and reviewed. Normalized outputs live in `intelligence/normalized/`.

## Data_Broker_Full_Registry_2025.xlsx.csv

- 3,336 rows / 750 unique brokers (`GroupUUID_Combined`), merged from the five
  US state data-broker registries: Oregon (1,060), Vermont (981), California
  Attorney General (549), California Privacy Protection Agency (496),
  Texas (250).
- Underlying facts are public-record state registry filings. The merge and
  UUID grouping were performed by Kenshiki Labs (2026-06). Registry snapshots
  reflect 2025 filings; individual broker details (opt-out URLs, contacts)
  may have drifted since filing.
- Source family: `state_registry`.

## defense-copy-v3-keyed.json

- Schema `defense-registry.v3-harm`; 105 curated defense destinations with
  harm profiles, actor classes, friction/cost metadata, situation routing,
  and per-destination AI guardrails. Source of truth for the Kenshiki app's
  Defense tab and the defense.kenshiki microsite spec.
- Authored by Kenshiki Labs (2026-06); severity ratings cite documented
  FTC/FCC/CFPB/DOJ actions per `defense_kenshiki_spec.md` in KenshikiDeviceSDK.
- Source family: `kenshiki_defense_registry`.

## data_monetization_supply_chain.json

- Kenshiki Labs research artifact mapping the tiered US personal-data
  monetization supply chain (collection → aggregation → resale). Used for
  supply-chain-tier joins between observed trackers and downstream brokers,
  not for runtime rules.
- Source family: `kenshiki_defense_registry`.

## License

State registry facts are public records. The Kenshiki-authored compilation,
registry, and supply-chain files are first-party works of Kenshiki Labs and
are licensed under this repository's MIT license.
