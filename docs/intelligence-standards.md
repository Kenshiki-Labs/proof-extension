---
title: "Tracker Intelligence Standards"
description: "The upstream standards Proof Extension uses for tracker metadata, privacy blocking policy, and rule import governance."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-01
nextReview: 2026-09-29
version: "0.0.1"
status: draft
---

Proof Extension must not invent tracker intelligence policy from scratch. The local intelligence database should be compatible with two external standards:

- DuckDuckGo Tracker Radar for tracker entity metadata and behavioral classification.
- EasyPrivacy/EasyList policy for privacy-blocking scope and rule-family compatibility.

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

## Local Database Rules

Every local tracker record must be defensible by at least one source:

- Tracker Radar metadata
- EasyPrivacy/EasyList rule or policy category
- direct reproducible fixture/test evidence
- vendor documentation or privacy policy
- source-code evidence from a first-party test fixture

Every imported or manually authored tracker record must include:

- source family: `manual_seed`, `manual_fixture`, `vendor_docs`, `easyprivacy`, `easylist`, `duckduckgo_tracker_radar`, or `first_party_evidence`
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

## Import Guardrails

Do not blindly convert upstream lists into blocking rules. Imports must pass through validation and review:

- schema validation with Zod
- duplicate id checks
- tracker-to-company referential integrity
- tracker-to-remediation referential integrity
- malformed URL/domain rejection
- snapshot tests for imported rule transforms
- golden fixture tests for expected matches and non-matches

EasyPrivacy-style filter syntax should be treated as an import format, not as the runtime model. Runtime records should remain normalized into `trackers.json`, `companies.json`, and `remediation.json` so popup explanations can group by company and route users to source-level remediation.

## Product Implications

The popup must not present upstream-rule matches as complete safety. A blocked request means future browser-layer collection was blocked or reduced. It does not delete prior records and does not prevent server-side logs, IP visibility, TLS fingerprinting, or account-level data processing.

When Tracker Radar and EasyPrivacy disagree, Proof Extension should prefer the more conservative user-facing statement:

- show the observation when evidence exists
- lower confidence when ownership or purpose is uncertain
- avoid claiming deletion or complete prevention
- keep the source-level remediation path separate from browser blocking
