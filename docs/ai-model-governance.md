---
title: "AI Model Governance"
description: "Governance controls for opt-in AI explanation features and intelligence-pipeline AI assistance in Proof Extension."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-01
nextReview: 2026-09-29
version: "0.0.1"
status: draft
---

Proof Extension treats AI features as model-assisted explanations, not as evidence engines. This memo maps the extension's AI posture to model-risk-management style controls without making the extension dependent on financial-services regulation.

## Scope

Covered AI uses:

- opt-in report explanation
- opt-in event explanation
- remediation draft generation
- false-positive report drafting
- tracker intelligence curation outside user runtime
- rule import normalization suggestions

Not covered as allowed runtime uses:

- AI blocking decisions
- AI-only tracker detection
- silent browsing telemetry upload
- user profiling
- identity scoring
- backend graph correlation for users

## Governance Principle

Use the same discipline expected of governed models: inventory, intended use, data lineage, validation, monitoring, change control, fallback, and auditability.

The extension's core rule remains stricter than ordinary AI product rules:

```text
Deterministic evidence is the record.
AI explanation is commentary on the record.
```

## Model Inventory

Every AI integration must have an inventory entry before release.

Required fields:

- feature id
- feature owner
- provider or local model name
- model version when available
- intended use
- prohibited use
- input fields allowed
- input fields forbidden
- output surface
- fallback behavior
- kill switch
- validation tests
- last review date
- next review date

## Data Provenance

AI inputs must be assembled from typed, deterministic extension records:

- `ObserverEvent`
- `SiteSummary`
- tracker DB records
- company DB records
- remediation DB records
- security indicator records when implemented

AI prompts must not include raw page content, cookies, form values, localStorage values, sessionStorage values, credentials, tokens, API keys, or unredacted copied reports.

Raw URLs are forbidden by default. If a user explicitly includes raw URL details, the UI must show that choice in the payload preview.

## Validation

Each AI feature requires tests for:

- payload redaction
- forbidden field exclusion
- prompt contract inclusion
- output labeling as explanation
- fallback when provider is unavailable
- fallback when model output violates the contract
- deterministic UI behavior with AI disabled

Model output must be checked against hard rules before display. If output claims unsupported evidence, safety, compromise, deletion, MITM, Sybil detection, or a blocking result absent from deterministic events, the UI must refuse or replace the answer with a failure state.

## Monitoring And Drift

For local template explanations, drift means template/spec mismatch.

For cloud or local model integrations, drift checks must include:

- prompt snapshot tests
- golden report explanation fixtures
- refusal tests for unsupported claims
- redaction regression tests
- provider/version change review
- periodic manual review of sample outputs

No AI provider or model version change should ship silently. Treat provider and model changes as behavior changes.

## Kill Switch And Fallback

AI must have a user-visible and programmatic off switch.

Required fallback:

- AI disabled: local template explanations still work.
- AI provider error: deterministic report remains visible.
- AI policy failure: UI shows `AI explanation unavailable` and preserves evidence.
- AI disabled by release config: no AI controls appear except settings disclosure if needed.

## Change Control

Changes requiring review:

- new provider
- new model
- new fields allowed in payloads
- raw URL inclusion
- remediation drafting behavior
- prompt contract changes
- output filtering changes
- intelligence-pipeline use that affects tracker DB records

Any AI-generated tracker intelligence must go through normal DB governance: source notes, license notes, Zod validation, referential integrity tests, fixture tests, and human review before it can affect runtime claims or blocking.

## Audit Artifacts

Maintain these artifacts for serious release readiness:

- AI feature inventory
- prompt contract snapshots
- payload schema
- redaction test fixtures
- golden output fixtures
- fallback tests
- provider/version review log
- known limitations
- user-facing AI disclosure text

## Store And User Disclosure

User-facing disclosure must state:

- AI is off by default.
- AI is optional.
- Detection and blocking work without AI.
- AI explains supplied evidence; it does not create evidence.
- The user reviews payloads before sending.
- Browsing history and page content are not sent by default.
- Provider terms apply when a user chooses a cloud provider.
