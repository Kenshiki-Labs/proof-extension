# Provenance: California Data Broker Registry 2026

- `California_Data_Broker_Registry_2026.csv`: 581 broker filings, 77 columns,
  from the California data broker registry (CPPA/DROP era), 2026 filing cycle.
  Added to the repo 2026-07-03.
- Uniquely rich relative to the 2025 five-state merge: per-broker CCPA request
  metrics (delete/know/opt-out/limit counts, compliance splits, mean/median
  response days for 2024), sharing disclosures (foreign actors, federal
  government, state governments, law enforcement, GenAI developers), and
  FCRA/GLBA/IIPPA/CMIA/HIPAA regulatory status.
- Underlying facts are public-record registry filings; normalization by
  Kenshiki Labs under this repository's MIT license.
- Source family: `state_registry`.
- Import governance: raw source only. Normalized via `pnpm intel:normalize`
  into `intelligence/normalized/ca-brokers-2026.json`; joins into the entity
  SSOT (`entities.json`). No runtime effect without reviewed promotion per
  `docs/intelligence-standards.md`.
