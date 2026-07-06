---
title: "Tracker DB Baseline"
description: "Generated snapshot of tracker database coverage, provenance, remediation, and SDK-signature state. Regenerate with pnpm db:baseline."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-06
status: generated
---

> Generated from commit `c3b9cc3` by `pnpm db:baseline`. Do not hand-edit.

## Summary

- Trackers: **44** (Phase 1 minimum: 25)
- Companies: **44**, remediation records: **42**
- SDK-global signatures: **38/44** trackers covered
- Provenance: **5** seed / **39** source-backed
- Remediation: deletion link **44/44**, opt-out link **44/44**
- Explanation coverage: **44/44**
- Blocking-limit coverage: **44/44**
- Not-visible-to-extension coverage: **44/44**
- Valuation coverage: **44/44** (21 sourced / 23 estimated)
- Blockability classes in use: `network_blockable` (39), `user_action_required` (5)

### By category

- advertising: 20
- session-replay: 5
- analytics: 3
- product-analytics: 2
- behavioral-profiling: 2
- customer-messaging: 2
- identity-resolution: 2
- tag-manager: 1
- customer-data-platform: 1
- experimentation: 1
- performance-monitoring: 1
- data-management-platform: 1
- cross-device-tracking: 1
- marketing-automation: 1
- consent-management: 1

## Per-tracker state

| Tracker | Category | Parent | Domains | Paths | SDK sig | Review | Source | Deletion | Opt-out | Friction | Verified | Privacy contact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fullstory | session-replay | FullStory | 2 | 2 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| google-analytics | analytics | Alphabet Inc. | 1 | 2 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| google-tag-manager | tag-manager | Alphabet Inc. | 1 | 2 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| google-ads | advertising | Alphabet Inc. | 3 | 2 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| meta-pixel | advertising | Meta Platforms, Inc. | 2 | 2 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| tiktok-pixel | advertising | ByteDance Ltd. | 1 | 1 | yes | seed | manual_seed | yes | yes | unknown | 2026-07-01 | no |
| linkedin-insight | advertising | Microsoft Corporation | 2 | 1 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-01 | no |
| hotjar | session-replay | Contentsquare | 2 | 2 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| mixpanel | product-analytics | Mixpanel, Inc. | 3 | 2 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| segment | customer-data-platform | Twilio Inc. | 2 | 3 | no | source_backed | manual_seed | yes | yes | medium | 2026-07-01 | no |
| amplitude | product-analytics | Amplitude, Inc. | 2 | 1 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| criteo | advertising | Criteo SA | 2 | 1 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| adobe-analytics | analytics | Adobe Inc. | 2 | 1 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| braze | behavioral-profiling | Braze, Inc. | 2 | 1 | yes | source_backed | manual_seed | yes | yes | unknown | 2026-07-01 | no |
| intercom | customer-messaging | Intercom, Inc. | 2 | 1 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| drift | customer-messaging | Salesloft, Inc. | 1 | 1 | yes | source_backed | manual_seed | yes | yes | unknown | 2026-07-01 | no |
| optimizely | experimentation | Optimizely, Inc. | 2 | 1 | yes | source_backed | manual_seed | yes | yes | unknown | 2026-07-01 | no |
| crazyegg | session-replay | Crazy Egg, Inc. | 1 | 1 | yes | source_backed | manual_seed | yes | yes | unknown | 2026-07-01 | no |
| quantcast | advertising | Quantcast Corporation | 1 | 1 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| taboola | advertising | Taboola.com Ltd. | 1 | 1 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| outbrain | advertising | Outbrain Inc. | 1 | 1 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-01 | yes |
| snap-pixel | advertising | Snap Inc. | 2 | 1 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| pinterest-tag | advertising | Pinterest, Inc. | 2 | 1 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-01 | no |
| twitter-pixel | advertising | X Corp. | 2 | 1 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-01 | no |
| yandex-metrica | session-replay | Yandex N.V. | 1 | 2 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-01 | no |
| microsoft-clarity | session-replay | Microsoft Corporation | 1 | 1 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-01 | yes |
| datadog-rum | performance-monitoring | Datadog, Inc. | 1 | 1 | yes | source_backed | manual_seed | yes | yes | unknown | 2026-07-01 | no |
| the-trade-desk | advertising | The Trade Desk, Inc. | 1 | 0 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-03 | yes |
| pubmatic | advertising | PubMatic, Inc. | 1 | 0 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-03 | yes |
| magnite | advertising | Magnite, Inc. | 2 | 0 | yes | seed | manual_seed | yes | yes | low | 2026-07-03 | yes |
| openx | advertising | OpenX Technologies, Inc. | 1 | 0 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-03 | yes |
| index-exchange | advertising | Index Exchange Inc. | 2 | 0 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-03 | yes |
| lotame | data-management-platform | Lotame Solutions, Inc. | 1 | 0 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-03 | yes |
| liveramp | identity-resolution | LiveRamp Holdings, Inc. | 1 | 0 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-03 | yes |
| id5 | identity-resolution | ID5 Technology Ltd | 1 | 0 | no | source_backed | manual_seed | yes | yes | low | 2026-07-03 | yes |
| 33across | advertising | 33Across, Inc. | 2 | 0 | no | seed | manual_seed | yes | yes | low | 2026-07-03 | yes |
| tapad | cross-device-tracking | Experian plc | 1 | 0 | no | source_backed | manual_seed | yes | yes | medium | 2026-07-03 | yes |
| 6sense | behavioral-profiling | 6sense Insights, Inc. | 1 | 0 | no | seed | manual_seed | yes | yes | medium | 2026-07-03 | yes |
| hubspot | marketing-automation | HubSpot, Inc. | 4 | 0 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-03 | yes |
| microsoft-ads | advertising | Microsoft Corporation | 1 | 0 | yes | source_backed | manual_seed | yes | yes | low | 2026-07-03 | yes |
| amazon-ads | advertising | Amazon.com, Inc. | 1 | 0 | yes | seed | manual_seed | yes | yes | low | 2026-07-03 | no |
| reddit-pixel | advertising | Reddit, Inc. | 1 | 0 | yes | source_backed | manual_seed | yes | yes | medium | 2026-07-03 | no |
| sourcepoint | consent-management | Sourcepoint Technologies, Inc. | 1 | 1 | no | source_backed | first_party_evidence | yes | yes | medium | 2026-07-05 | no |
| comscore | analytics | Comscore, Inc. | 1 | 3 | yes | source_backed | first_party_evidence | yes | yes | medium | 2026-07-05 | no |

## Gap register

- **Provenance**: 5 of 44 records are hand-authored seeds pending Tracker Radar / EasyPrivacy source backing (Phase 3).
- **All trackers are network_blockable** — no `content_mitigatable` or `observable_only` records exist yet, so only one of six blockability classes is exercised by the DB.
- **No SDK-global signature** (6): segment, id5, 33across, tapad, 6sense, sourcepoint.
- **Unknown remediation friction** (6): tiktok-pixel, braze, drift, optimizely, crazyegg, datadog-rum.
- **Missing privacy contact** (15): tiktok-pixel, linkedin-insight, segment, braze, drift, optimizely, crazyegg, pinterest-tag, twitter-pixel, yandex-metrica, datadog-rum, amazon-ads, reddit-pixel, sourcepoint, comscore.
- **Missing explanation coverage** (0): none.
- **Missing blocking-limit coverage** (0): none.
- **Missing not-visible-to-extension coverage** (0): none.
- **Missing valuation coverage** (0): none.
- **Shared remediation records**: `google-default` used by 3 trackers.
