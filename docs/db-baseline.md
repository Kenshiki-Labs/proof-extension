---
title: "Tracker DB Baseline"
description: "Generated snapshot of tracker database coverage, provenance, remediation, and SDK-signature state. Regenerate with pnpm db:baseline."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-03
status: generated
---

> Generated from commit `2e3586c` by `pnpm db:baseline`. Do not hand-edit.

## Summary

- Trackers: **27** (Phase 1 minimum: 25)
- Companies: **27**, remediation records: **25**
- SDK-global signatures: **24/27** trackers covered
- Provenance: **27** seed / **0** source-backed
- Remediation: deletion link **27/27**, opt-out link **27/27**
- Blockability classes in use: `network_blockable` (27)

### By category

- advertising: 11
- session-replay: 5
- analytics: 2
- product-analytics: 2
- customer-messaging: 2
- tag-manager: 1
- customer-data-platform: 1
- behavioral-profiling: 1
- experimentation: 1
- performance-monitoring: 1

## Per-tracker state

| Tracker | Category | Parent | Domains | Paths | SDK sig | Review | Source | Deletion | Opt-out | Friction | Verified | Privacy contact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fullstory | session-replay | FullStory | 2 | 2 | yes | seed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| google-analytics | analytics | Alphabet Inc. | 2 | 3 | yes | seed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| google-tag-manager | tag-manager | Alphabet Inc. | 1 | 2 | yes | seed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| google-ads | advertising | Alphabet Inc. | 3 | 2 | no | seed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| meta-pixel | advertising | Meta Platforms, Inc. | 2 | 2 | yes | seed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| tiktok-pixel | advertising | ByteDance Ltd. | 1 | 1 | yes | seed | manual_seed | yes | yes | unknown | 2026-07-01 | no |
| linkedin-insight | advertising | Microsoft Corporation | 2 | 1 | yes | seed | manual_seed | yes | yes | medium | 2026-07-01 | no |
| hotjar | session-replay | Contentsquare | 2 | 2 | yes | seed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| mixpanel | product-analytics | Mixpanel, Inc. | 3 | 2 | yes | seed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| segment | customer-data-platform | Twilio Inc. | 2 | 3 | no | seed | manual_seed | yes | yes | medium | 2026-07-01 | no |
| amplitude | product-analytics | Amplitude, Inc. | 2 | 1 | yes | seed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| criteo | advertising | Criteo SA | 2 | 1 | yes | seed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| adobe-analytics | analytics | Adobe Inc. | 2 | 1 | no | seed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| braze | behavioral-profiling | Braze, Inc. | 2 | 1 | yes | seed | manual_seed | yes | yes | unknown | 2026-07-01 | no |
| intercom | customer-messaging | Intercom, Inc. | 2 | 1 | yes | seed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| drift | customer-messaging | Salesloft, Inc. | 1 | 1 | yes | seed | manual_seed | yes | yes | unknown | 2026-07-01 | no |
| optimizely | experimentation | Optimizely, Inc. | 2 | 1 | yes | seed | manual_seed | yes | yes | unknown | 2026-07-01 | no |
| crazyegg | session-replay | Crazy Egg, Inc. | 1 | 1 | yes | seed | manual_seed | yes | yes | unknown | 2026-07-01 | no |
| quantcast | advertising | Quantcast Corporation | 1 | 1 | yes | seed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| taboola | advertising | Taboola.com Ltd. | 1 | 1 | yes | seed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| outbrain | advertising | Outbrain Inc. | 1 | 1 | yes | seed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| snap-pixel | advertising | Snap Inc. | 2 | 1 | yes | seed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| pinterest-tag | advertising | Pinterest, Inc. | 2 | 1 | yes | seed | manual_seed | yes | yes | medium | 2026-07-01 | no |
| twitter-pixel | advertising | X Corp. | 2 | 1 | yes | seed | manual_seed | yes | yes | medium | 2026-07-01 | no |
| yandex-metrica | session-replay | Yandex N.V. | 1 | 2 | yes | seed | manual_seed | yes | yes | low | 2026-07-01 | no |
| microsoft-clarity | session-replay | Microsoft Corporation | 1 | 1 | yes | seed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| datadog-rum | performance-monitoring | Datadog, Inc. | 1 | 1 | yes | seed | manual_seed | yes | yes | unknown | 2026-07-01 | no |

## Gap register

- **Provenance**: 27 of 27 records are hand-authored seeds pending Tracker Radar / EasyPrivacy source backing (Phase 3).
- **All trackers are network_blockable** — no `content_mitigatable` or `observable_only` records exist yet, so only one of six blockability classes is exercised by the DB.
- **No SDK-global signature** (3): google-ads, segment, adobe-analytics.
- **Unknown remediation friction** (6): tiktok-pixel, braze, drift, optimizely, crazyegg, datadog-rum.
- **Missing privacy contact** (11): tiktok-pixel, linkedin-insight, segment, braze, drift, optimizely, crazyegg, pinterest-tag, twitter-pixel, yandex-metrica, datadog-rum.
- **Shared remediation records**: `google-default` used by 3 trackers.
