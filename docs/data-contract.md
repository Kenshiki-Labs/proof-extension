---
title: "Data Contract: Observation → Store → Display"
description: "The binding contract for every stage of the evidence pipeline — what each term means, which module owns it, and which test enforces it."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-05
nextReview: 2026-09-29
version: "0.0.2"
status: draft
---

Every number and label a user sees must trace through this contract. A term
defined here has exactly one meaning, one owning module, and one enforcement
point. If a surface needs a number this contract does not define, the fix is
to extend the contract — never to compute inline.

## The pipeline and its owners

| Stage | Owner | Contract | Enforced by |
| --- | --- | --- | --- |
| 1. Observation | content scripts, background observers | `ObserverEventSchema` (`core/contracts/schemas.ts`) | Zod parse at the message boundary; forged/malformed events rejected |
| 2. Enrichment | background only | `enrichScriptInjection`, `enrichSdkDetection`, `detectCookieSync` | unit tests; main world can never self-attribute a vendor |
| 3. Store | `core/state/summaries.ts` | `SiteSummarySchema`; derivation rules below | `summaries.test.ts` |
| 4. Intelligence | `intelligence/` pipeline | per-artifact schemas in `core/contracts/intelligence.ts` | `intel:check` (byte-identical regeneration) + `intel:promote --check` (runtime = promoted projection) in `pnpm qa` |
| 5. Display | `core/report/metrics.ts` + `display.ts` | `SummaryMetrics`; UI renders selectors, computes nothing | `metrics.test.ts` bans inline count arithmetic in UI files |

## Event families (stage 1)

Every stored event belongs to exactly one family; families never mix in a
displayed count:

- **Page activity** — what the page or third parties actually did
  (`request_seen`, `request_blocked`, `script_injected`, `sdk_detected`,
  `cookie_sync`, hook events).
- **Local page signals** (`isLocalPageSignalEvent`) — first-party page code
  preparing consent/CMP plumbing or SHA-256 identifier hashes. They remain
  page activity for evidence/copy/debug, but they never become active company
  or watcher counts.
- **Exposure scan** (`source: "extension-scan"`) — what Pulse could read
  locally. Never implies the page read those fields.
- **Diagnostics** (`isDiagnosticEvent`) — the extension reporting on itself.
  Never inflates any observer-facing count.

## Store derivation rules (stage 3)

- `activeCompanies` / `blockedCompanies` / `mitigatedCompanies` derive ONLY
  from page-activity events by status; rebuilt on every write. Local page
  signals and persistence-surface rows are excluded from company buckets.
- One blocked request is one outcome: the DNR block supersedes the
  webRequest seen-event for the same requestId (`supersedeEvent`).
- Same event id recurring = one observation with an incremented `count`.
- Retention (days) and per-tab caps are enforced on every read.

## Display definitions (stage 5) — the only vocabulary surfaces may use

| Term | Definition | Selector field |
| --- | --- | --- |
| Observations | grouped page-visible observations, one per observer + signal | `observations` |
| Events | recorded page-activity events; excludes diagnostics and exposure scan | `recordedEvents` |
| Exposure | extension-run exposure scan events | `exposureEvents` |
| Watching | companies whose collection is still happening | `watchingCompanies` |
| Blocked | companies with an actually-blocked request (evidence-backed) | `blockedCompanies` |
| Can't block | signals no browser tool can block | `cannotBlockSignals` |
| Local page signals | grouped first-party consent/CMP and SHA-256 digest rows; appendix/debug only | `localPageSignals` |
| Stored events | everything in storage incl. diagnostics (diagnostics panel only) | `storedEvents` |
| Who it serves | per-tracker beneficiary class: a feature you use / works for the site / ads with claimed relevance trade / only their business | `whoItServes` on the tracker record; rollup `servesCounts` + `onlyTheirBusiness*` |
| Supply-chain role | per-tracker position in the ad-money flow: mineshaft / concentrator / refinery / parts / assembly / wholesale / impulse rack / vertically integrated / outside the ad rail | `supplyChainRole` on the tracker record; `groupBySupplyChainStage` for display |

Rules:

- A label used on two surfaces MUST resolve to the same selector field.
- UI files must not compute headline counts inline — `metrics.test.ts`
  scans `popup.tsx` and `report.tsx` for banned patterns and fails the build.
- The copy/export payload uses the same selector values (congruence test).

## Attention model (ranking and tiers)

`core/domain/attention.ts` is the only place importance is computed. Every
surface that lists observers sorts by `rankObservers`; the popup and report
verdict lines come from `buildVerdict`. Rules:

- Tier dominates: red (only their business) > amber (ads trade) > gray
  (site tooling, features, unattributed) — regardless of dollar value.
- Within a tier, score orders by confidence, annual value (log-scaled),
  and risk level; blocked observers sink (×0.3), mitigated halve.
- Pinned by `attention.test.ts` (broker outranks walled garden; blocked
  sinks; exposure scan excluded from ranking).

## Change protocol

Adding or changing a displayed number:

1. Define it in `SummaryMetrics` with a doc comment (meaning, exclusions).
2. Add/extend the definition row in this document.
3. Render it from the selector on every surface that shows it.
4. Extend `metrics.test.ts` if the change introduces a new derivation.

Any PR that changes a displayed count without touching `metrics.ts` is, by
definition, a contract violation.
