---
title: "Tracker Intelligence Standards"
description: "The upstream standards Proof Extension uses for tracker metadata, privacy blocking policy, and rule import governance."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-03
nextReview: 2026-09-29
version: "0.0.1"
status: draft
---

Proof Extension must not invent tracker intelligence policy from scratch. The local intelligence database should be compatible with two primary external standards:

- DuckDuckGo Tracker Radar for tracker entity metadata and behavioral classification.
- EasyPrivacy/EasyList policy for privacy-blocking scope and rule-family compatibility.

Ghostery TrackerDB and WhoTracks.Me are useful secondary references for taxonomy, tracker/company joins, and prevalence language, but they are license-gated candidate sources rather than approved runtime data sources.

## DuckDuckGo Tracker Radar

Repository: <https://github.com/duckduckgo/tracker-radar>

Use Tracker Radar as the benchmark for:

- parent entity and ownership metadata
- domain-level tracker records
- behavioral classification
- prevalence/context metadata where available
- fingerprinting, cookies, privacy policy, and performance fields where available

Tracker Radar is not itself a blocklist. It is a metadata corpus for common third-party domains. Proof Extension may use it to enrich company/entity classification and explain who is observing a page.

Licensing constraint: Tracker Radar data is Creative Commons Attribution-NonCommercial-ShareAlike 4.0. Do not vendor or redistribute Tracker Radar-derived data in this MIT repository without an explicit license review and attribution plan. If imported data is added, the repo must document source, version, transformation, attribution, and redistribution terms.

## EasyPrivacy / EasyList Policy

Policy: <https://easylist.to/pages/policy.html>

Use EasyPrivacy policy as the benchmark for what counts as privacy-relevant tracking. In scope categories include:

- analytics
- antibot or bot checks
- telemetry
- tracking pixels or cookies
- referrers
- beacons
- fingerprinting
- email tracking
- impressions, events, performance, and pageview logging
- user-agent checks or monitoring
- resource miners
- hit counters
- CNAME trackers
- notification servers and popups when they include tracking behavior
- loading, linking, or initializing known tracking servers or scripts

EasyPrivacy also distinguishes useful implementation categories:

- generic tracking patterns used by first or third parties
- first-party tracking, including self-hosted trackers and CNAME trackers
- third-party hosted tracking scripts
- tracking-only servers that should be blocked at URL level

Proof Extension should treat these categories as policy inputs for local rule import, classification, and UI language.

## Ghostery TrackerDB / WhoTracks.Me

Repositories:

- <https://github.com/ghostery/trackerdb>
- <https://github.com/whotracksme/whotracks.me>

Use Ghostery TrackerDB and WhoTracks.Me as prior art for:

- tracker, organization, and category modeling
- category vocabulary such as advertising, site analytics, consent management, customer interaction, hosting, social media, utilities, and extensions
- organization metadata fields such as privacy policy URL, privacy contact, country, and description
- pattern metadata such as domains, filter expressions, category, organization, and website URL
- ecosystem-level prevalence language such as reach, site reach, cookies, query-string identifiers, referrer leakage, SameSite=None cookies, scripts, iframes, beacons, images, XHR/fetch, fonts, and media requests
- correction workflows for companies or maintainers that dispute tracker metadata

WhoTracks.Me is a measurement and transparency publication, not a browser-extension runtime blocklist. Its aggregate datasets are useful for background context and UI vocabulary, but they must not be treated as direct evidence that a specific user was observed on a specific tab. Runtime observations must still come from browser-visible events, reviewed local tracker records, or reproducible fixtures.

Ghostery TrackerDB is closer to a candidate import source because it provides organizations, categories, and request patterns. However, its data is published under Creative Commons Attribution-NonCommercial-ShareAlike 4.0. Do not vendor, redistribute, bundle, or use TrackerDB-derived records in runtime blocking or popup claims without explicit license review and an attribution/redistribution plan. If a future import is approved, keep generated artifacts quarantined under `intelligence/normalized/` until individual records are reviewed and promoted into `src/core/db/*`.

Implementation guidance:

- Treat TrackerDB pattern filters as an import format, not the runtime model.
- Preserve upstream release/version, URL, license, and transform notes on every generated artifact.
- Map Ghostery organizations to local companies only through reviewed joins.
- Map Ghostery categories to local UI language conservatively; for example, `utilities` and `hosting` should not automatically imply invasive behavioral tracking.
- Use WhoTracks.Me measurement terms only for general ecosystem context unless Proof has local tab evidence for the same behavior.
- Add a dedicated schema source family only after legal/product approval; until then, do not promote Ghostery-derived records into runtime DB files.

## Local Database Rules

Every local tracker record must be defensible by at least one source:

- Tracker Radar metadata
- EasyPrivacy/EasyList rule or policy category
- approved Ghostery TrackerDB-derived metadata after license review
- direct reproducible fixture/test evidence
- vendor documentation or privacy policy
- source-code evidence from a first-party test fixture

Every imported or manually authored tracker record must include:

- source family: `manual_seed`, `manual_fixture`, `vendor_docs`, `easyprivacy`, `easylist`, `duckduckgo_tracker_radar`, `first_party_evidence`, `state_registry`, `kenshiki_defense_registry`, or `kenshiki_entity_index`
- source version/date when available
- transformation notes when the source was converted into a local rule
- license/attribution notes when the source imposes redistribution conditions
- false-positive review status

Local schema names are intentionally stable enum identifiers:

| Schema value | Meaning |
| --- | --- |
| `manual_seed` | Hand-authored seed data pending source-backed review. |
| `manual_fixture` | Reproducible local fixture or captured event evidence. |
| `vendor_docs` | Vendor documentation, privacy policy, or developer docs. |
| `easyprivacy` | EasyPrivacy rule or policy category. |
| `easylist` | EasyList rule or policy category. |
| `duckduckgo_tracker_radar` | DuckDuckGo Tracker Radar metadata. |
| `first_party_evidence` | First-party source-code or fixture evidence. |
| `state_registry` | US state data-broker registry filings (Vermont, Oregon, Texas, California AG/CPPA). Public-record provenance for broker identity, opt-out, and contact data. |
| `kenshiki_defense_registry` | Kenshiki-authored defense destination registry and supply-chain research (`defense-registry.v3-harm`). First-party curated remediation intelligence. |
| `kenshiki_entity_index` | Kenshiki-authored identity join index across runtime tracker DB records, normalized registry records, and defense/remediation destinations. Facts remain in the per-source artifacts. |

## Import Guardrails

Do not blindly convert upstream lists into blocking rules. Imports must pass through validation and review:

- schema validation with Zod
- duplicate id checks
- tracker-to-company referential integrity
- tracker-to-remediation referential integrity
- malformed URL/domain rejection
- source license compatibility checks before runtime promotion
- snapshot tests for imported rule transforms
- golden fixture tests for expected matches and non-matches

EasyPrivacy-style and TrackerDB-style filter syntax should be treated as import formats, not as the runtime model. Runtime records should remain normalized into `trackers.json`, `companies.json`, and `remediation.json` so popup explanations can group by company and route users to source-level remediation.

## Entity SSOT Operations

The entity SSOT is `intelligence/normalized/entities.json`. It is generated by `pnpm intel:normalize` and answers only one question: which extension-relevant per-source records refer to the same real-world organization. It must not become a facts table. Source-specific facts stay in the normalized source artifacts and runtime facts stay in `src/core/db/*` until reviewed promotion.

The entity SSOT is intentionally extension-scoped. It keeps entities reachable from runtime tracker/company observations. Broker-only, defense-only, supply-chain-only, or otherwise research-only entities must be quarantined under `intelligence/quarantine/` until a reviewed promotion links them to an observed runtime company or tracker. Quarantine artifacts may support audit and evaluation, but they are not runtime intelligence and must not be imported by popup, report, background, content-script, or DNR code.

Every entity join must carry:

- facet key, such as `company:google`, `broker2025:<id>`, `ca2026:<id>`, or `defense:<id>`
- join method: `anchor`, `domain`, `name`, or `alias`
- confidence score and confidence label
- deterministic reason strings explaining the evidence used

The resolver must also emit `intelligence/normalized/entity-conflicts.json`. This is the generated review queue for extension-scoped domain ownership collisions, slug ownership collisions, multi-entity domain matches, and low-confidence joins. A conflict in this file means the data can remain in the SSOT as an import artifact, but it must not be promoted into runtime claims until reviewed. Research-only conflicts belong under `intelligence/quarantine/`.

Human decisions live in `intelligence/adjudication/entity-adjudications.json`. This file is the manual adjudication ledger; it is hand-authored, sorted by id when populated, and referenced by generated conflict records. Generated files may read it, but generated files must not be hand-edited to encode review decisions.

Each normalization run must also write a versioned snapshot manifest under `intelligence/snapshots/<snapshot-version>/manifest.json`. The manifest pins every SSOT artifact by SHA-256 and supports HMAC-SHA256 signing with `INTELLIGENCE_SNAPSHOT_SIGNING_KEY`. If the signing key is absent, the manifest must state `unsigned_no_key` rather than presenting a hash as a signature.

## Product Implications

The popup must not present upstream-rule matches as complete safety. A blocked request means future browser-layer collection was blocked or reduced. It does not delete prior records and does not prevent server-side logs, IP visibility, TLS fingerprinting, or account-level data processing.

When Tracker Radar and EasyPrivacy disagree, Proof Extension should prefer the more conservative user-facing statement:

- show the observation when evidence exists
- lower confidence when ownership or purpose is uncertain
- avoid claiming deletion or complete prevention
- keep the source-level remediation path separate from browser blocking
