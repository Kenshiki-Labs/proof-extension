---
title: "Extension Vocabulary Contract"
description: "Canonical UI terms for Pulse Observer popup, report, and value-ledger surfaces."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-03
status: active
---

## Purpose

The extension UI must use one vocabulary across popup, report, and value-ledger surfaces. Copy drift makes the product feel uncertain and can turn estimates into overclaims.

## Canonical Terms

| Use | Meaning |
| --- | --- |
| `Evidence` | Current-tab observations and receipts. |
| `Evidence types` | Count of grouped evidence categories in the full report summary. |
| `Evidence type` | A single grouped evidence category in tables/details. |
| `Current tab evidence` | Full report evidence mode title. |
| `Value ledger` | The product surface for local rolling value history. |
| `Local value ledger` | Section/page title for local rolling tracker presence. |
| `Estimated data value` | Current-page value estimate. |
| `Observed tracker presence` | The unit behind rolling value. Do not imply actual attention or revenue. |
| `This period` | The selected rolling period's visit-level estimate. |
| `Ad value/yr` | Annual revenue-model estimate represented by observed trackers. |
| `Site tooling/yr` | Annual operator-cost estimate represented by observed tools. |
| `Sites` | Unique site origins in the selected period. |
| `Visits` | Top-level visits in the selected period. |
| `Trackers` | Unique tracker ids in the selected period. |
| `Observations` | Raw evidence events. Does not multiply value. |
| `Watching` | Companies whose collection is currently observed and not blocked. |
| `Blocked` | Companies whose requests were actually stopped by an enabled rule. |
| `Can't block` | Signals no browser tool can block. |
| `Blocking changes` | What browser blocking changes in the future. |
| `Blocking does not change` | Limits of browser blocking, including no deletion of prior records. |
| `Stop at source` | Source-level opt-out/deletion/remediation surface. |

## Banned Aliases

Do not use:

- `You monetized`
- `What you are worth`
- `Your value/yr`
- `Active` as a summary metric label
- `Cannot` as a summary metric label
- `Signals` as a summary metric label
- `Signal` as a table/detail label
- `They earned`
- `sold your data`
- `company that profits from you`
- `companies that profit from you`
- `Rolling local value`

Use the canonical terms above instead.

## Frequency Report

Run `pnpm vocab:analyze` after intentional copy changes. It writes `docs/vocabulary-frequency.json` with canonical term counts and top UI words.

Run `pnpm vocab:check` to fail on banned aliases or stale frequency output. `pnpm qa` runs this check.
