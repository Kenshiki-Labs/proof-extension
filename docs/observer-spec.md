---
title: "Pulse Browser Extension - LLM Build Specification"
description: "The full build specification for Pulse Observer: product definition, threat model, architecture, detection/blocking spec, and acceptance criteria."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-04
nextReview: 2026-09-29
version: "0.0.2"
status: draft
---

## Current Implementation Baseline

As of 2026-07-04 (repo version 0.3.1), the implementation is beyond the original Phase 1 seed state in UI fidelity, valuation, local ledgering, and QA guardrails, but it is still not source-backed at tracker-claim level.

Current runtime state:

- 42 runtime tracker records in `src/core/db/trackers.json`.
- 42/42 tracker records use `schemaVersion: 2` high-fidelity explanation fields.
- 42/42 tracker records include `perPersonValue` valuation blocks promoted from normalized market research.
- 42/42 tracker records have remediation links; 40 remediation records back 42 trackers.
- 42/42 tracker records remain `review.status: seed` for tracker identity/collection/blocking claims.
- 0/42 tracker records are source-backed for tracker claims.
- 42/42 tracker records include `market_research` provenance for valuation only; this must not satisfy tracker identity, collection, blocking, or remediation provenance.
- 40/42 trackers have SDK/global signatures (`src/core/signals/sdk-globals.ts`); segment (only global is the generic `window.analytics`, excluded by the false-attribution policy) and tapad (no browser-visible SDK global) are uncovered by design.
- Network matching runs through an in-memory hostname suffix index (O(hostname labels) per request, not O(trackers × domains)), satisfying the constant-time host-lookup requirement ahead of Phase 3 imports; one request resolves to at most one match per tracker.
- Background storage writes are coalesced (250ms window, flushed on suspend and before local-data clears) instead of serializing every tab summary and the valuation ledger on every event.
- 42/42 tracker records carry `supplyChainRole` (position in the ad-money flow) and `whoItServes` (benefit-category classification with plain-language note) fields consumed by the attention model and value-ledger views.
- 38 trackers are `network_blockable`; 4 high-breakage trackers (google-tag-manager, intercom, drift, hubspot) are `user_action_required` because the blocking-policy gate never offers or installs a block rule for them — validation now rejects any record that is both high-breakage and `network_blockable`. No runtime DB records yet exercise `content_mitigatable`, `observable_only`, `pre_request_unblockable`, or `server_side_unblockable`.
- Tracker domain spaces are validated as disjoint across records: one request matches exactly one tracker record (a former google-analytics/google-tag-manager overlap double-counted gtag.js loads and could have installed a GTM-blocking rule via the Google Analytics toggle).
- The extension-scoped entity SSOT has 42 runtime entities and 0 extension-scoped entity conflicts needing review: all 10 are adjudicated in `intelligence/adjudication/entity-adjudications.json` (4 parent-alias slug collisions confirmed as intentional product-level entity separation; 6 broker-registry claims to reddit.com/tiktok.com rejected as crawled social-profile links, provable from the registry source URLs). Conflict ids are scope-namespaced (`runtime-conflict-*` vs `research-conflict-*`) so an adjudication can never ambiguously match a same-numbered conflict in the quarantined research queue (67 research conflicts remain open there by design).
- Research-only entities remain quarantined under `intelligence/quarantine/`.

Current implemented product surfaces:

- Popup renders icon-only actions with visible hover/focus tooltips: full report, value ledger, copy output.
- Popup and report share headline summary math through `src/core/report/metrics.ts`.
- Popup and report share canonical vocabulary enforced by `pnpm vocab:check`.
- An attention model (`src/core/domain/attention.ts`) ranks observers worst-first on every listing surface using who-it-serves category, confidence, valuation, and risk level, compressed into red/amber/gray tiers; ranking weights are part of `docs/data-contract.md`.
- Full report uses a segmented `Evidence` / `Value ledger` view.
- Report Evidence mode uses the overhauled IA shipped in 0.3.x: verdict banner, summary metrics, one ranked `Who is watching — worst first` list with four lenses (`Actors`, `Money`, `Network`, `Timeline`), a collapsed `Appendix — full evidence for auditors` (exposure scan, atomic observe/block matrix, per-company remediation dossiers), a `Clean up this page` batch remediation flow, and diagnostics. See the Full report tab section for the canonical structure.
- The Phase 1.5 exportable remediation checklist is implemented: `Clean up this page` (`src/components/CleanupFlow.tsx`) turns per-card decisions into one worst-first checklist with tier chips, time/identity cost per row, session done-marks, and a copyable plain-text export.
- Blocking is per-tracker via the `blockedTrackerIds` user setting; nothing is blocked by default, and block offers are breakage-aware.
- Value ledger is stored locally in extension storage, not cookies or page storage.
- Value ledger tracks top-level visits, tracker presence per visit, raw observations, period estimates, ad-market value to trackers, site-paid tool fees, and flow-level supply-chain roles.
- Value ledger includes `Value supply chain`, `Bill of materials`, `Who they serve`, local tracker/site connections, and `How we calculate this` sections that state counting rules and limitations.
- Current-tab valuation and rolling value ledger keep revenue and operator-cost estimates separate.
- Persistence-surface observers are implemented for the JavaScript-visible subset: `document.cookie` writes, `localStorage`/`sessionStorage` set/remove/clear, IndexedDB open/delete, Cache API open/delete/match/has, and service-worker registration. Metadata only — names redacted through a high-entropy mask, sizes and timing recorded, values never read; the privileged side re-redacts and rebuilds all evidence so the page channel cannot smuggle raw values or forge evidence. Cache validators (needs response-header observation), `HttpOnly` cookie metadata (needs the optional `cookies` permission), and respawn detection (needs keyed digests) remain unimplemented, and their event families are deliberately absent from the runtime schema until an emitter exists.
- Runtime valuation blocks are promoted from `intelligence/normalized/valuations.json`; hand drift is blocked by `pnpm intel:promote:check`.
- Design primitive drift is blocked by `pnpm design:check`.
- Vocabulary drift is blocked by `pnpm vocab:check`.

Current QA gate:

```bash
pnpm lint
pnpm design:check
pnpm vocab:check
pnpm typecheck
pnpm test:coverage
pnpm intel:check
pnpm intel:promote:check
pnpm build:chrome
```

`pnpm qa` currently runs the full gate above. Last verified run (2026-07-04) passed with 163 unit tests across 19 files and the Chrome MV3 build.

Primary remaining credibility gaps:

- Source-back tracker identity, ownership, collection, and blocking claims for the existing 42 records. This requires live retrieval of vendor documentation (the license-clean `vendor_docs` source family); provenance must never be filled in from memory without retrieval.
- Reclassification pass done 2026-07-04 for locally provable cases (high-breakage records now `user_action_required`); revisit remaining classes during source-backed review.
- Verify the 11 newly added SDK/global signatures against live vendor pages during the source-backed review (they follow the table's existing hand-authored policy; a wrong distinctive name is a silent miss, not a false attribution).
- Extend persistence-surface observation beyond the implemented JS-visible subset: `HttpOnly` cookie metadata via the optional `cookies` permission, cache-validator header evidence, and keyed-digest respawn detection.
- Extension-scoped entity conflicts adjudicated 2026-07-04 (0 open); the 67 quarantined research conflicts stay open until research entities are promoted.
- Keep valuation language as estimates, not measurements or actual revenue.

## Objective

Build a cross-browser browser extension that detects passive observation, explains who is observing the current session, blocks what can be blocked, and routes the user toward source-level suppression rather than false reassurance.

The extension must use a shared core with thin browser-specific adapters because Firefox and Chromium still diverge on manifest/runtime models and cannot rely on one universal manifest target.

The default implementation framework is Plasmo because it reduces multi-browser packaging overhead while preserving enough control for browser-specific adapters. CRXJS is acceptable only if the implementer explicitly prefers a lower-level Vite-first build pipeline.

## Spec Information Architecture

This document is organized in decision order, not implementation-file order:

1. Product definition and roadmap.
2. Trust boundaries, non-goals, and threat model.
3. Browser targets and framework constraints.
4. Runtime architecture and normalized event model.
5. Detection, blocking, intelligence, and remediation requirements.
6. UI, storage, security, and opt-in AI rules.
7. Build, type, message, testing, and performance requirements.
8. Capability backlog, implementation checklist, and acceptance criteria.

When sections appear to overlap, use this precedence order: security/privacy rules, threat model, product principles, roadmap scope, then backlog. Backlog items are not promises until promoted into a roadmap phase with acceptance criteria.

## Product Definition

This extension is not a generic privacy blocker.

It is:

- A live observer panel.
- A tracker intelligence UI.
- A browser-layer mitigation tool.
- A source-level remediation router.

It must answer four questions for the active tab:

1. Who is observing this page right now?
2. What are they collecting?
3. Did the extension block it, partially mitigate it, or fail to stop it?
4. What is the path to stop collection or delete already-held records at the source?

## Product Positioning

The differentiated product is not another tracker blocker. It is browser-local observation intelligence:

- deterministic evidence collection
- local-first session summaries
- first-party observation visibility
- tracker company intelligence
- blocked, mitigated, active, and cannot-block status labeling
- source-level remediation routing
- exportable evidence
- optional AI explanation, never AI evidence

The extension should feel closer to a privacy inspector and remediation console than an ad blocker. It should tell the user what happened, what changed, what did not change, and what must be handled at the source.

### Strategic relationship to Kenshiki

Pulse Observer is Kenshiki's public proof artifact and top-of-funnel evidence demo, not the standalone company by default. Its job is to make Kenshiki's evidence discipline tangible in the browser: deterministic local evidence, explicit limits, economic interpretation, and source-level next steps.

The strategic product rule is:

> Pulse Observer exists to demonstrate Kenshiki's evidence discipline in the browser. It may become a standalone product only if Phase 1 proves repeatable demand without compromising local-first trust or requiring an unbounded tracker-intelligence operation.

The extension must therefore optimize for proof quality over market breadth. Phase 1 done impeccably is the bounded product target: a normal user should understand in the first ten seconds who watched them, what was stopped, what could not be stopped, what persisted, who benefits economically, and where source-level remediation begins. The full report is the proof layer for skeptics, journalists, investors, and technical buyers; it must support the popup's claims, not become the primary user experience.

Later roadmap phases are optional expansion paths. They must not be treated as company-scale commitments unless they clear demand, maintenance, platform-risk, and opportunity-cost review.

### Feature doctrine

Pulse does not compete with generic blockers on rule count. Every feature must clear all three bars, in this order:

1. **More observation**: it surfaces evidence competitors cannot or do not show (first-party behavior, cached/proxied/cloaked trackers, exposure surfaces).
2. **Description of the thing observed**: the observation names who is observing, what they collect, and what it is monetized for — in plain factual language backed by evidence strings.
3. **Action from the observation**: the observation routes to something the user can do — a block toggle, a mitigation setting, or a source-level remediation path — or states plainly why no action exists.

A feature that only widens blocking makes Pulse a slightly bigger blocker; a feature that clears all three bars makes it a better observer. Prefer the latter.

## Product Roadmap

### Phase 0: Trustworthy foundation

Goal: prove the extension can observe browser-visible evidence locally without a telemetry backend.

Required capabilities:

- Plasmo project with shared core and thin browser adapters.
- Zod-validated contracts and tracker DB files.
- Non-invasive first-party exposure scan for browser-visible passive surfaces.
- Isolated content-script bridge with duplicate suppression.
- Background event router with tab-scoped summaries.
- Local storage persistence and retention limits.
- Copy/export current tab report.
- Chrome MV3 build and E2E fixture proving network, DOM, and exposure-scan observation without page breakage.

Done when:

- Proof can be loaded with the extension enabled without breaking page rendering
- passive browser-surface exposure appears as locally generated, evidence-backed extension-scan events
- no browsing telemetry leaves the browser
- `pnpm qa` and Chromium extension E2E (`pnpm test:e2e`) pass

### Phase 1: Launchable observer product

Goal: ship a narrow, honest public build from the Proof website while store approval is pending.

Required capabilities:

- `/observe` download page on the Proof site.
- Versioned Chrome MV3 downloadable artifact.
- Popup content for `Watching now`, `Blocked`, `Still exposed`, `Cannot block`, source-level remediation, and `What blocking changes`.
- Full report tab for detailed evidence, exposure scan, atomic observe/block matrix, source remediation, timeline, and diagnostics.
- Network `request_seen` events from the tracker DB.
- Chromium DNR block rules and block-result reporting where available.
- At least 25 high-value tracker records with company/remediation joins.
- Company grouping in the popup.
- Evidence and confidence visible on every observer card.
- Local data clear and retention controls.

Done when:

- a user can install from `/observe`, visit Proof, and see first-party observation explained
- a fixture page with Meta Pixel, Google Analytics, and FullStory produces correct seen/blocked UI states
- copied output is coherent enough to paste into an issue without additional context

### Phase 1.5: Source-level remediation

Goal: make the product useful after detection by routing the user to source-level action.

Required capabilities:

- Remediation cards for every known company.
- Future collection opt-out links.
- Deletion request links.
- Identity verification requirement display.
- Estimated time and friction class.
- Recheck interval/reminder metadata.
- Plain `blocking does not delete prior records` statement.
- Exportable remediation checklist.

Done when:

- every known observer card either has a remediation path or explicitly states why none is known
- the UI never implies browser blocking deleted source-held records

### Phase 2: Opt-in diagnostics, mitigation, and parity

Goal: move from non-invasive default observation to controlled, opt-in diagnostics and mitigation where browser APIs allow it without breaking ordinary pages.

Required capabilities:

- Settings-backed canvas mitigation behind an explicit user/developer control.
- WebGL query observation and mitigation only in opt-in diagnostic mode, never as an automatic page-load hook.
- Audio fingerprint observation and mitigation only in opt-in diagnostic mode, never as an automatic page-load hook.
- Font enumeration observation where feasible without mutating page APIs by default.
- Persistence-surface observation for cookies, `localStorage`, `sessionStorage`, IndexedDB, Cache API, service workers, and cache validators, with values redacted by default.
- Supercookie-like respawn indicators only when repeated local evidence supports the claim; otherwise label as durable storage or cache-identifier evidence, not a supercookie.
- Options toggles that actually change runtime behavior.
- Firefox adapter parity for core observation and status labels, including evaluating a Firefox MV3 migration (build currently targets `firefox-mv2`; see Build Commands).

Done when:

- `content_mitigatable` events become `mitigated` only when the hook changes or constrains the API result
- Chrome, Edge, and Firefox expose the same normalized event/status model

### Phase 3: Intelligence pipeline

Goal: make the tracker DB auditable, source-backed, and maintainable.

Required capabilities:

- DuckDuckGo Tracker Radar metadata importer.
- EasyPrivacy import/normalization pipeline.
- Ghostery TrackerDB / WhoTracks.Me source evaluation for taxonomy, company metadata, prevalence language, and correction workflow patterns, with runtime use blocked until license approval.
- Market-research valuation source corpus normalized into `intelligence/normalized/valuations.json` and promoted into runtime only through `pnpm intel:promote`.
- Promotion drift checks for every runtime field projected from normalized intelligence.
- Source family, source version/date, license notes, and transform notes on records.
- Required `sources` and `review` metadata for every tracker record before it can affect runtime blocking or claims.
- Snapshot tests for imported rule transforms.
- Golden fixture tests for expected matches and non-matches.
- False-positive review fixtures.
- Signed DB update manifest design.

Done when:

- no tracker record can affect runtime blocking or claims without provenance and schema validation
- import transforms are deterministic and snapshot-tested

### Phase 4: Browser-visible security indicators

Goal: add a second mode for security and privacy leak indicators without overclaiming compromise.

Required capabilities:

- Token-in-URL detection.
- Referrer leakage detection.
- Cross-origin form-action detection.
- Suspicious redirect and lookalike-origin indicators.
- Unsafe `postMessage` indicators where observable.
- Mixed-content and weak-policy indicators where exposed.
- Identity consistency indicators with explicit non-Sybil language.

Done when:

- the UI distinguishes `security indicator` from `tracker observation`
- the extension never claims MITM or Sybil detection without directly supportable browser-visible evidence

### Phase 5: Opt-in AI explanation

Goal: use AI to explain evidence and draft next steps without compromising local-first trust.

Required capabilities:

- AI off by default.
- `Explain this tab report` flow.
- Payload preview before send.
- Redaction before send.
- Bring-your-own provider key or local endpoint.
- Prompt contract tests.
- AI output labeled as explanation, not evidence.

Done when:

- detection and blocking work fully with AI disabled
- no browsing telemetry is sent without user-reviewed payload and explicit confirmation
- AI cannot invent evidence, blocking status, company ownership, or remediation links

## Required Product Principles

- The browser is not the root of trust.
- First-party fingerprinting counts as observation even when no third-party host is involved.
- Blocking does not equal deletion.
- The extension must distinguish blocked, active, mitigated, and cannot-block outcomes.
- The extension must not send browsing telemetry to a vendor backend in v1.
- The UI tone must be cold, factual, and non-theatrical.
- The extension must never say the user is safe.
- Every assertion must be traceable to a local evidence record, intelligence DB record, or explicit limitation.

## Non-Goals

- Not a VPN.
- Not an anonymity product.
- Not a universal anti-fingerprinting browser.
- Not a data broker removal service in v1.
- Not a promise that blocked collection deletes historical records.
- Not a replacement for browser security boundaries.
- Not dependent on a vendor backend for v1 detection or UI rendering.

## Threat Model

### In scope

- Third-party analytics scripts.
- Pixels and beacon endpoints.
- Session replay vendors.
- Tag managers.
- Known fingerprinting libraries.
- First-party fingerprint-relevant API use.
- Dynamic script injection after page load.
- Third-party cookie sync behavior where visible to the extension.
- Cookie metadata, page-visible Web Storage activity, durable browser storage activity, cache validators, service-worker registration, and repeated storage respawn patterns where observable.
- Tracker script and ingest URLs that match the local intelligence database.
- Page-level use of high-risk browser APIs such as canvas, audio, WebGL, font enumeration, and optional WebRTC local IP exposure attempts.

### Out of scope

- IP address exposure to the destination server.
- TLS fingerprinting.
- Server-side request logs.
- Request headers emitted before content intervention.
- Data already collected before installation.
- Authenticated account data held by the visited site.
- Collection performed in native apps, other browsers, or other devices.
- Collection hidden behind encrypted server-to-server integrations.
- Raw cookie values, raw `localStorage` values, raw `sessionStorage` values, IndexedDB records, Cache API response bodies, and service-worker script bodies.
- Definitive HSTS, TLS, browser-cache, or device-level supercookie proof where the browser does not expose enough local evidence.

### Required limitation language

When an exposure is outside the browser's control, the UI must state that plainly. Example: `This extension cannot prevent the destination server from seeing your IP address or request headers.`

## Required Framework

### Primary choice

Use Plasmo as the framework baseline.

### Allowed fallback

Use CRXJS only if the build requires direct manifest control or the team already has a strong Vite/Rollup pipeline.

### Disallowed approach

Do not build separate product codebases for Chrome and Firefox. One shared core is mandatory. Only the adapter layer may diverge.

## Browser Targets

| Browser | Requirement |
| --- | --- |
| Chrome | Required, MV3 target |
| Edge | Required, same logic as Chrome, separate packaging |
| Firefox | Required, separate adapter target; MV2 build initially for compatibility with Firefox channels where MV3 support lags — revisit before Phase 2 |
| Safari | Excluded from v1 |

## Functional Scope

### Must detect

- Third-party analytics scripts.
- Pixels and beacon endpoints.
- Session replay vendors.
- Tag managers.
- Known fingerprinting libraries.
- First-party fingerprint-relevant API use.
- Dynamic script injection after page load.
- Third-party cookie sync behavior where visible.
- Cookie metadata and JavaScript-visible cookie writes.
- Web Storage key/write/delete/clear metadata.
- IndexedDB, Cache API, and service-worker persistence metadata.
- HTTP cache validators and other cache-identifier headers where visible to request/response observers.
- Supercookie-like respawn behavior only as a confidence-labeled pattern, not a certainty claim.
- CNAME-cloaked or first-party-proxied tracker endpoints where detectable by DB rules or script behavior (best-effort; see Adversarial and evasion cases for the unsupported subset).

### Must classify

- Company name.
- Parent company.
- Category of observation.
- What is collected.
- What it is monetized for.
- Blockability class.
- Detection confidence.
- Evidence strings supporting the classification.
- Source-level remediation path.

### Must block where possible

- Known third-party tracker network requests.
- Known replay ingest endpoints.
- Known external analytics libraries.

### Must partially mitigate where possible

Default observation must be non-invasive. Mitigation hooks may be installed only after an explicit user/developer setting enables that class, and they must be disabled if they cause page breakage on the fixture set.

- Canvas reads.
- Audio fingerprinting.
- WebGL fingerprinting.
- Some font enumeration paths.
- WebRTC local IP exposure attempts where browser APIs allow safe intervention.

### Must explicitly mark as non-blockable

- IP address.
- TLS fingerprint.
- Server-side logging.
- Request headers emitted before content intervention.
- Account-level data already held by the visited service.

## First-Party Observation Policy

First-party observation must be classified even when no third-party tracker host exists.

First-party behavior should be labeled by purpose when evidence supports the label:

| Policy label | Example evidence | Default status |
| --- | --- | --- |
| `site_functionality` | API call is necessary for visible page function | `active` |
| `security_or_fraud` | Bot detection, login risk scoring, abuse prevention | `active` or `mitigated` |
| `analytics` | Internal event collection, conversion measurement | `active` |
| `fingerprinting` | Canvas/audio/WebGL/font reads that produce stable identifiers | `mitigated` when hookable, otherwise `active` |
| `behavioral_profiling` | Keystroke, pointer, scroll, or replay-style capture | `active` or `blocked` when network-blockable |
| `unknown_first_party` | Suspicious collection without sufficient attribution | `active` with low confidence |

The extension must not whitelist first-party collection by default. It may explain that some first-party collection is needed for site function, security, or fraud prevention, but it must still report what is observed.

The Proof site itself is a required first-party test fixture. The extension must classify Proof's own browser-local instrumentation honestly as first-party observation.

## Detection Confidence and Evidence

Every detected item must include confidence and evidence.

Confidence levels:

- `confirmed`: deterministic domain, path, rule, script hash, or known library match.
- `probable`: behavior strongly matches a category, but exact vendor or purpose is inferred.
- `weak`: suspicious behavior exists, but attribution or purpose is uncertain.

Evidence requirements:

- `evidence` must be an array of short factual strings.
- Evidence strings must name observable facts, not conclusions.
- The popup may summarize evidence, but expanded cards must expose the supporting evidence.

Examples:

- `Request matched domain suffix edge.fullstory.com.`
- `Script inserted after page load from https://connect.facebook.net.`
- `CanvasRenderingContext2D.getImageData was called by a same-origin script.`
- `Request was visible before content hooks could run.`

## Blockability Model

Use precise blockability classes instead of a simple boolean.

```ts
export type BlockabilityClass =
  | "network_blockable"
  | "content_mitigatable"
  | "observable_only"
  | "pre_request_unblockable"
  | "server_side_unblockable"
  | "user_action_required"
```

Status must be resolved separately from blockability:

```ts
export type ObservationStatus = "active" | "blocked" | "mitigated" | "cannot_block"
```

Resolution rules:

- `network_blockable` becomes `blocked` only when a block action actually occurred.
- `content_mitigatable` becomes `mitigated` only when a hook changed or constrained the API result.
- `observable_only` remains `active` unless a stronger adapter-specific action applies.
- `pre_request_unblockable` and `server_side_unblockable` resolve to `cannot_block`.
- `user_action_required` resolves to `active` until the user completes the source-level remediation path.

No silent action is allowed. If the system takes an action, the popup must be able to surface that state.

## Architecture

```text
src/
├── core/
│   ├── db/
│   │   ├── trackers.json
│   │   ├── companies.json
│   │   └── remediation.json
│   ├── domain/
│   │   ├── detect.ts
│   │   ├── classify.ts
│   │   ├── remediate.ts
│   │   ├── status.ts
│   │   ├── entropy.ts
│   │   └── types.ts
│   ├── state/
│   │   ├── store.ts
│   │   ├── messages.ts
│   │   └── summaries.ts
│   ├── content/
│   │   ├── dom-watch.ts
│   │   ├── canvas-hook.ts
│   │   ├── audio-hook.ts
│   │   ├── webgl-hook.ts
│   │   └── script-detect.ts
│   └── ui/
│       ├── popup/
│       ├── options/
│       └── components/
├── adapters/
│   ├── chromium/
│   │   ├── manifest.ts
│   │   ├── background.ts
│   │   └── dnr-rules.json
│   └── firefox/
│       ├── manifest.ts
│       └── background.ts
└── package.json
```

### Architectural rule

Product logic belongs in `core`. Browser API differences belong in `adapters`. The popup must never branch directly on browser family. The UI must read normalized messages only.

## Runtime Components

### Background runtime

Responsibilities:

- Listen for request-level observation events.
- Listen for content-script events.
- Match events against the tracker intelligence database.
- Determine status: `active`, `blocked`, `mitigated`, or `cannot_block`.
- Maintain per-tab site summary.
- Persist compact summaries according to retention settings.
- Rehydrate state after Chromium service worker suspension.
- Reply to popup state requests.

### Content scripts

Responsibilities:

- Observe DOM mutations for script injection.
- Hook high-risk browser APIs.
- Report first-party observation behavior invisible to network-only tools.
- Avoid heavy overhead or site breakage.
- Emit normalized observation events only.

### Popup UI

Responsibilities:

- Render active page summary.
- Group by company, not raw hostname.
- Distinguish third-party, first-party, and unknown observers.
- Show clear status class.
- Show confidence without exaggeration.
- Expand to reveal what they collect and how to stop it at source.

### Options page

Responsibilities:

- Global settings.
- Toggle classes of mitigation.
- Local summary retention period.
- Local data clear action.
- DB version display.
- Import/export settings if implemented.

## Permission Model

The extension must request the smallest practical permission set.

Required permissions must be documented with rationale:

| Permission | Required for | Notes |
| --- | --- | --- |
| `declarativeNetRequest` | Chromium request blocking | Required for MV3 network blocking. |
| `declarativeNetRequestFeedback` | Chromium matched-rule reporting in development/review builds | Required only when the build reports deterministic DNR block outcomes. If unavailable, the UI must show seen/active rather than blocked unless another deterministic block signal exists. |
| `webRequest` | Request observation and tracker DB matching | Used for observation/classification, not MV2-style blocking. Blocking must remain DNR-backed on Chromium MV3. |
| `storage` | Settings, DB version, compact summaries | Must not store raw long-term browsing logs by default. |
| `tabs` or `activeTab` | Active-tab summary and refresh scan | Prefer `activeTab` where it is sufficient. |
| `scripting` | Content-script injection where needed | Use static content scripts when possible. |
| Host permissions | Request visibility and content observation | Keep broad host permissions justified and documented. |

Optional permissions should be requested at the moment of need, not during installation, when the browser supports that pattern.

Future persistence observers may require additional permission review:

| Permission | Required for | Notes |
| --- | --- | --- |
| `cookies` | Browser-level cookie metadata and change events, including `HttpOnly` metadata where the browser exposes it | Must be optional or separately justified before release. Raw cookie values must not be stored; local keyed digests are allowed only for short-retention respawn diagnostics. |

If `cookies` is not granted, cookie observation is limited to JavaScript-visible `document.cookie` behavior and request/response evidence. The UI must label this as lower visibility.

### Store-review permission posture

The preferred permission posture is minimal, but the product goal may require broad host permissions for v1 because request observation and content-script evidence must work before the user knows which sites are risky. The extension must therefore maintain a store-review justification file or README section explaining:

- why `activeTab` alone is insufficient for passive observation across ordinary browsing
- why `<all_urls>` host permission is needed for network visibility and first-party content hooks
- why `webRequest` is observation-only and not used for MV2-style blocking on Chromium
- why `declarativeNetRequest` is the Chromium MV3 blocking path
- why `declarativeNetRequestFeedback` is used only to report deterministic block outcomes where available
- what data is stored locally
- what data is never uploaded in v1
- how users can pause, clear, or limit local summaries

If a future browser review rejects broad host permissions, the fallback release mode is explicit per-site enablement with degraded defaults. That fallback must be labeled in the popup as lower visibility, not equivalent protection.

## Detection Specification

### Network detection

Detect by:

- Exact domain match.
- Domain suffix match.
- Path signature match.
- Request type match.
- Initiator context.
- Script URL and ingest endpoint pairing.
- CNAME or first-party proxy indicators where available (best-effort; see Adversarial and evasion cases for the unsupported subset, matching the Functional Scope framing above).

Examples:

- `connect.facebook.net`
- FullStory ingest endpoints
- Hotjar ingestion
- analytics beacons
- known fingerprinting vendor asset URLs

### Content detection

The default content strategy is non-invasive. It may observe DOM/script activity, request context, and passive browser-surface exposure from isolated content scripts. It must not monkey-patch hot rendering APIs on ordinary page load.

Separate evidence families are required:

- `page activity observed`: what the current page or third-party scripts actually did.
- `extension exposure scan`: what Pulse Observer could read locally from browser APIs. This does not prove the current page queried those fields.
- `extension diagnostic`: extension lifecycle, bridge, scan, and failure-state events. These must not inflate observer counts.

Default observation may include:

- dynamic `<script>` insertion after page load
- vendor SDK globals present in the main world (for example `window.fbq`, `window.FS`). The main-world observer reports only the raw global name; the privileged side joins it to the tracker DB, so pages cannot forge vendor attribution. This catches trackers whose network requests were cached, first-party proxied, or CNAME-cloaked.
- passive browser surface fields such as viewport, screen, timezone, locale, hardware concurrency, device memory, touch points, color scheme, reduced motion, webdriver, plugin count, cookie setting, and Do Not Track
- network request observation and tracker DB matching

Opt-in diagnostic or mitigation mode may observe or constrain:

- `HTMLCanvasElement.toDataURL`
- `CanvasRenderingContext2D.getImageData`
- `AudioContext`
- `WebGLRenderingContext.getParameter`
- optionally `RTCPeerConnection` local IP exposure attempts

Each content observation event must include:

- event type
- timestamp
- page origin
- probable script origin if available
- action taken: observe, mitigate, or block
- confidence
- evidence

Invasive hooks must not be enabled by default. They must be treated as diagnostics or mitigation, not as the baseline observer path.

### Persistence surface detection

Persistence surfaces are a first-class evidence family because they answer whether the browser became durable raw material for future identification, measurement, retargeting, or attribution. They must be represented separately from network requests, SDK globals, fingerprinting reads, and security leak indicators.

The observer may collect metadata for:

- cookies: name, domain, path, expiry, `Secure`, `HttpOnly`, `SameSite`, partition key where exposed, approximate value byte length, write/change timing, and tracker/company match when known
- JavaScript-visible cookie writes via `document.cookie`, without storing the assigned value
- `localStorage` and `sessionStorage`: key name after redaction, operation type, approximate value byte length, frame origin, script origin where available, and write/delete/clear timing
- IndexedDB: database name after redaction, object-store name where exposed, open/delete/version-change timing, frame origin, and tracker/company match when known
- Cache API: cache name after redaction, request origin, method family, and timing, never response body contents
- service workers: registration/update/unregister timing, scope origin, script origin, and scope path after URL redaction
- cache validators: `ETag`, `If-None-Match`, `Last-Modified`, and related cache identifiers as header-name evidence, never raw identifier values by default

The observer must not store raw values from cookies, Web Storage, IndexedDB, Cache API entries, service-worker scripts, authorization headers, form fields, or URL query parameters. If value-equivalence is needed to detect respawn behavior, use a local keyed digest with a per-install secret stored only in extension storage; clear it with `CLEAR_LOCAL_DATA`; never export or upload it; and keep the event confidence no stronger than `probable` unless the same digest reappears across multiple independent persistence surfaces after a clear/delete attempt.

Required persistence event families:

- `cookie_observed`: cookie metadata or JavaScript-visible cookie write/change observed.
- `storage_write`: `localStorage` or `sessionStorage` set/delete/clear metadata observed.
- `indexeddb_access`: IndexedDB open/delete/version metadata observed.
- `cache_storage_access`: Cache API open/put/delete/match metadata observed.
- `service_worker_registered`: service worker registration, update, or unregister metadata observed.
- `cache_validator_seen`: cache-validator header evidence observed.
- `storage_respawn_suspected`: the same local keyed digest or identifier pattern reappeared after a clear/delete attempt or across multiple storage surfaces.

Confidence rules:

- Use `confirmed` for the act of observing a cookie, storage write, service-worker registration, IndexedDB access, Cache API access, or cache-validator header.
- Use `probable` for supercookie-like respawn behavior only when repeated local evidence supports recurrence.
- Use `weak` for one-off durable-storage or cache-identifier hints that could be ordinary application state.

UI language must distinguish:

- `Cookie observed`
- `Storage write observed`
- `Durable storage observed`
- `Cache identifier observed`
- `Possible respawn behavior observed`

The UI must not say `supercookie created` or `persistent identifier proven` unless the implementation can point to repeated, local, redacted evidence that survives an attempted clear/delete flow.

### Adversarial and evasion cases

The implementation must explicitly handle or mark unsupported. This is the unsupported counterpart to the best-effort CNAME/proxy detection listed in Functional Scope and Network detection above — detect what DB rules and heuristics can catch, and document the rest here as a known limitation:

- CNAME cloaking.
- Tracker scripts proxied through first-party paths.
- Obfuscated dynamic script injection.
- Late-loaded iframes.
- Tag manager indirection.
- Consent-management events.
- Service worker-mediated requests.
- Storage respawn through browser internals that are not exposed to extensions.
- HSTS, TLS, or cache-layer identifiers that cannot be inspected without privileged browser internals.
- Same-device or cross-device re-identification that occurs entirely server-side.

Unsupported cases must be documented in the UI or README as limitations.

## Blocking Specification

### Chromium

Use `declarativeNetRequest` for request blocking because MV3 no longer supports the older Chrome MV2 blocking model.

### Firefox

Use an adapter path aligned to Firefox request interception support while normalizing outcomes to the same event/status model used on Chromium.

### Status classes

Every detected item must resolve to one of:

- `blocked`
- `active`
- `mitigated`
- `cannot_block`

No silent action is allowed. If the system takes an action, the popup must be able to surface that state.

## Tracker Intelligence Database Spec

### trackers.json

Each record must include:

```json
{
  "id": "fullstory",
  "schemaVersion": 2,
  "displayName": "FullStory",
  "match": {
    "domains": ["fullstory.com", "edge.fullstory.com"],
    "paths": ["/s/fs.js", "/rec/page"],
    "requestTypes": ["script", "xmlhttprequest"]
  },
  "companyId": "fullstory",
  "category": "session-replay",
  "collects": [
    "scrolls",
    "clicks",
    "navigation",
    "potential form interaction metadata"
  ],
  "monetization": [
    "UX analytics",
    "conversion optimization",
    "behavior replay"
  ],
  "browserAction": {
    "blockability": "network_blockable",
    "method": "network-block",
    "siteBreakage": {
      "risk": "low",
      "affects": ["session replay recording"],
      "note": "Blocking may reduce FullStory recording but should not break core site navigation."
    },
    "whatBlockingChanges": [
      "Blocks future browser requests matching FullStory domains and ingest paths."
    ],
    "whatBlockingDoesNotChange": [
      "Does not delete prior recordings held by FullStory or the site."
    ]
  },
  "observes": {
    "browserVisible": ["session replay script request URL", "recording ingest request URL"],
    "siteProvided": ["clicks", "scroll distance", "navigation events"],
    "notVisibleToExtension": ["masked-field policy choices made by the site"]
  },
  "userImpact": {
    "plainSummary": "FullStory lets a site collect product analytics and session replay events.",
    "whyItMatters": ["Session replay tooling can capture detailed interaction patterns on a page."],
    "riskLevel": "high",
    "riskReasons": ["session replay", "behavioral analytics"]
  },
  "confidence": "confirmed",
  "evidenceTemplate": [
    "Request matched FullStory domain or ingest path."
  ],
  "remediationId": "fullstory-default",
  "sources": [
    {
      "family": "manual_seed",
      "name": "Proof Extension seed tracker database",
      "version": "0.0.1",
      "retrieved_at": "2026-07-02",
      "license": "MIT",
      "transform_notes": "Hand-authored seed record based on common public tracker domains and product behavior; not imported from a third-party list."
    }
  ],
  "review": {
    "status": "seed",
    "last_reviewed_at": "2026-07-02",
    "reviewer": "Kenshiki",
    "notes": "Seed record pending source-backed Tracker Radar/EasyPrivacy import review."
  },
  "perPersonValue": {
    "schemaVersion": 1,
    "currency": "USD",
    "geography": "US",
    "userProfile": "average_adult_internet_user",
    "valueType": "cost",
    "monetizationFlow": "operator_saas",
    "perVisit": {
      "microdollars": 40,
      "dollars": 0.00004,
      "basis": "operator SaaS pricing divided by tracked users"
    },
    "annual": {
      "low_usd": 0.5,
      "high_usd": 5,
      "midpoint_usd": 2.75
    },
    "valueNote": "Enterprise session replay cost paid by the site.",
    "sourceNote": "Vendor pricing tiers",
    "sourceFindingIds": ["fullstory-valuation-2026"],
    "lastUpdated": "2026-07-03",
    "confidence": "estimated"
  }
}
```

`market_research` provenance backs only `perPersonValue` claims. It must not be counted as tracker identity, ownership, collection, blocking, or remediation provenance.

Each record must also include two classification fields consumed by the attention model and value-ledger views:

- `supplyChainRole`: the tracker's position in the ad-money flow. Current values: `mine_infrastructure`, `refinery`, `parts_supplier`, `concentrator`, `assembly`, `wholesale`, `retail_shelf`, `vertically_integrated`, `site_tooling`.
- `whoItServes`: `{ "category": "you_and_the_site" | "the_site" | "advertisers_and_maybe_you" | "only_their_business", "note": "<plain-language benefit statement>" }`.

### companies.json

Each record must include:

- company id
- company name
- parent company
- aliases
- category labels for display
- jurisdiction if known
- support or privacy contact if known

### remediation.json

Each record must include:

- `future_collection_url`
- `deletion_url`
- `identity_verification_required`
- `estimated_time_minutes`
- `recheck_interval_days`
- `friction_class`
- `notes`
- `jurisdiction_notes`
- `last_verified_at`

### Database governance

- Every DB file must include a schema version.
- DuckDuckGo Tracker Radar is the benchmark for tracker entity metadata, ownership, and behavioral classification.
- EasyPrivacy/EasyList policy is the benchmark for privacy-blocking scope, filter compatibility, and tracking categories.
- Imported intelligence must follow `docs/intelligence-standards.md` before it can affect runtime blocking or popup claims.
- Additions must include source notes or a reproducible reason for classification.
- Every tracker must include `sources` and `review` metadata.
- Network-blockable trackers must include a blocking-policy source family such as `manual_seed`, `manual_fixture`, `vendor_docs`, `easyprivacy`, `easylist`, or `first_party_evidence`.
- `schemaVersion: 2` tracker records must include display name, browser-visible observation fields, user-impact language, blocking-change language, blocking-limit language, site-breakage guidance, and valuation data.
- Runtime valuation data must be promoted from `intelligence/normalized/valuations.json` and checked by `pnpm intel:promote:check`.
- The test suite must reject duplicate tracker ids, duplicate company ids, invalid remediation references, missing provenance, malformed domains, malformed paths, and path-only rules.
- False-positive reports must be reproducible with a test page or captured event fixture.
- Remote DB updates are not required in v1. If added later, updates must be signed and verified before use.
- If DB parsing fails, the extension must keep working with the last valid local DB or a bundled fallback.

## UI Spec

### Popup layout

Top-level sections, in this order:

1. `Watching now`
2. `Estimated data value`
3. `Local value ledger`
4. `Recent observations`
5. `Blocked`
6. `Still exposed`
7. `Cannot block`
8. `Stop at source`
9. `What blocking changes`

This is the canonical top-level popup IA. Roadmap phases, acceptance criteria, and implementation tickets must preserve these user-facing concepts. Sections that list observers sort worst-first by the attention model; `Still exposed` renders as `Still exposed — worst first`. `Cannot block` is required because non-blockable exposures are first-class evidence, not empty state copy. `What blocking changes` is required because browser blocking does not delete historical or source-held records.

The popup header uses compact icon-only actions with visible hover/focus tooltips and `aria-label`s: full report, value ledger, and copy output. The value-ledger action opens the report tab in `Value ledger` mode; there is no separate value-ledger route.

`Stop at source` is not a page-breakage state. It means source-level remediation: opt-out links, deletion request links, verification requirements, friction class, and reminder intervals for the company or first-party origin that collected data. It may appear inside expanded observer cards or as a dedicated remediation section when there are enough remediation items to summarize.

Popup/report headline numbers must come from `src/core/report/metrics.ts`. UI files must not recompute headline metrics inline under the same labels.

### Full report tab

The popup is a compact controller. Detailed evidence and rolling value history belong in the full extension tab opened from the popup after inline confirmation.

The report tab must use normalized background state only. It must not own observation state independently of the background service worker.

The report has a segmented control with two modes:

- `Evidence`: current-tab evidence and remediation.
- `Value ledger`: local rolling value history across observed browsing.

Evidence mode structure, in this order (user-facing titles follow the tone rules — plain language, no mechanism names; internal identifiers in parentheses are stable for tests and tickets). This is the 0.3.x attention-model IA: one ranked observer list with switchable lenses replaced the earlier four stacked observer sections, and full per-company dossiers moved to a collapsed auditors' appendix:

1. Verdict banner (verdict): one-line plain-language verdict for the tab.
2. `Summary` (summary): headline metrics from `src/core/report/metrics.ts`.
3. `Who is watching — worst first` (observer-attention): one list ranked by the attention model, with a segmented lens control — `Actors` (ranked observer table with per-tracker block toggles), `Money` (valuation view), `Network` (site-to-tracker connection graph), `Timeline` (evidence timeline).
4. `Appendix — full evidence for auditors` (collapsed by default): `What could be read about you` (exposure-scan), atomic signal matrix (observe-block-matrix), and full per-company remediation dossiers (remediation).
5. `Clean up this page` (cleanup): worst-first batch remediation checklist with tier chips, per-row time and identity cost, session done-marks, and copyable plain-text export.
6. `Diagnostics` (diagnostics).

The exposure-scan section must be labeled as extension-run local visibility. It must not imply the current page queried those fields. The observe-block matrix must exclude exposure-scan and extension-diagnostic events so it answers what page activity was actually observed and what can be blocked or mitigated. Moving a section into the appendix does not relax these rules.

Value-ledger mode sections:

1. `Local value ledger` summary with period selector: `Today`, `7 days`, `30 days`, `All`.
2. `Value supply chain`: bill-of-materials stage map for extraction/mining, refining, audience parts, auction assembly, wholesale/exchange, retail surface, and the missing input contract; then advertiser-funded ad rail, site-paid tool-fee rail, monetization-flow role cards, money-to-user `$0`, site-share-not-estimated, and unpriced ecosystem feedback.
3. `Who they serve`: counts by benefit category.
4. Local site/tracker connection graph.
5. Top trackers table: tracker, sites, visits, observations, this-period estimate, annual estimate.
6. Top sites table: site, trackers, visits, observations, this-period estimate.
7. `How we calculate this` methodology section.

Value-ledger copy must say estimates, not measurements. It must frame money as supply-chain rails, not a simple pie or one-pot allocation. It must not use `You monetized`, `What you are worth`, `They earned`, or `sold your data` language.

### Card fields

Each observer card must show:

- company name or first-party origin
- role label
- status chip
- confidence label
- one-line data collection statement
- expand control

Expanded state must show:

- what is already collected
- evidence facts
- future collection opt-out link
- deletion request link
- friction class
- reminder interval if re-opt-out is needed
- plain statement: blocking does not delete prior records

### Failure-mode UI

The popup must handle:

- Extension lacks permission for the current site.
- Browser-restricted page cannot be scanned.
- Content script injection failed.
- Browser adapter cannot enforce a block available in another browser.
- Chromium service worker was suspended and tab state is incomplete.
- Tracker DB is stale, malformed, or unavailable.
- Current tab has no detected observers.

Each failure state must use factual copy and must not imply complete protection.

### Tone rules

- Write for a reader with no technical background. Name concrete things (screen size, time zone, fonts, your internet address), never mechanisms (API, surface, SDK, DNR, TLS). If a term needs a glossary, rewrite the sentence.
- No fear copy.
- No gamified badges.
- No `you are safe` language.
- No false certainty.
- Use short factual sentences.

## Storage Rules

### Store locally

- settings
- tracker DB version
- compact per-origin summaries
- reminder timestamps
- last valid DB checksum if DB updates are added later

### Do not store by default

- long-term raw browsing logs
- full event histories across all sites indefinitely
- exported personal dossiers
- page content
- form values
- secrets, tokens, or credentials

### Rolling valuation ledger

The extension may store a local value ledger in `browser.storage.local`. This is user-local runtime history, not product intelligence.

The ledger stores:

- top-level site visits with generated `visitId`s
- tracker presence keyed by `visitId + trackerId`
- raw observation counts
- valuation snapshots active at observation time
- `flowRollups` for `platform_ads`, `programmatic`, `identity_infra`, and `operator_saas`

The ledger must not use cookies, page localStorage, or page sessionStorage. It must be cleared by `CLEAR_LOCAL_DATA`, and `CLEAR_VALUATION_LEDGER` may clear only the ledger. Retention pruning follows the user's `retentionDays` setting.

Counting rules:

- `visit` means a top-level page visit.
- `tracker presence` means a tracker appeared at least once during a visit.
- `observation` means raw evidence count.
- repeated raw requests increase `observations` but do not multiply per-visit value.
- annual estimates dedupe by tracker within the selected period.
- monetization-flow rollups count unique trackers for annual estimates and raw period entries for observations/this-period value.

### Retention

Configurable, default 14 days for compact summaries.

Raw per-tab event state should be memory-only unless the user explicitly enables diagnostic export.

## Security Rules

- No remote code loading.
- No eval.
- No analytics SDK inside the extension.
- No cloud upload of observed site data in v1.
- Signed DB updates only if remote DB updates are added later.
- Content hooks must not read form values.
- Diagnostic exports must be user-initiated and redacted.

## Opt-In AI Assistance

AI assistance is allowed only as an explicit opt-in explanation layer. It must never be enabled by default, required for detection, required for blocking, or treated as evidence.

Any AI feature must also satisfy `docs/ai-model-governance.md` before release. That document owns model inventory, data provenance, validation, monitoring, drift, kill-switch, fallback, and audit-artifact requirements.

### AI product rule

Deterministic evidence comes first:

- content hooks
- network matches
- DNR rule outcomes
- tracker DB records
- security indicators
- local storage state
- persistence-surface metadata

AI may then explain, summarize, prioritize, or draft remediation text from that evidence. AI must not create unverified claims, decide blocking, invent company ownership, invent remediation links, or silently receive browsing telemetry.

### Allowed AI modes

- Local template explanations with no model and no network call.
- User-triggered cloud explanation with payload preview and explicit confirmation.
- Bring-your-own provider key stored locally in extension storage.
- Local model explanation when browser support and package size make it practical.
- Intelligence-pipeline assistance for DB curation outside the user-facing runtime.

### Required AI UX

AI controls must be off by default. Any AI explanation flow must show:

- provider or local model mode
- exact payload preview
- redaction notice
- whether current origin is included
- whether raw URLs are included
- whether evidence strings are included
- whether tracker/remediation metadata is included
- confirmation before any network request

The primary first AI feature should be `Explain this tab report`, not open-ended chat. Per-event `Explain with AI` can follow after the report-level flow is safe.

### AI data rules

AI payloads may include only user-approved fields. The extension must never send these fields automatically:

- browsing history
- page content
- form values
- cookies
- localStorage values
- sessionStorage values
- IndexedDB records
- Cache API response bodies
- service-worker script bodies
- raw or stable storage identifiers
- credentials
- auth tokens
- API keys
- unredacted copied reports

Raw request URLs must be redacted by default because paths and query strings often contain identifiers or secrets.

### AI prompt contract

Every model prompt must include these constraints:

```text
You are explaining browser-visible evidence from a privacy extension.
Do not invent evidence.
Do not claim compromise.
Do not claim the user is safe.
Do not claim data was deleted.
Use only supplied evidence and supplied tracker metadata.
If evidence is insufficient, say what is unknown.
```

### AI output labels

AI output must be labeled as explanation, not verified evidence. The UI must distinguish:

- deterministic evidence
- local template explanation
- AI-generated explanation
- unknown or insufficient evidence

### AI non-goals

- AI must not block requests.
- AI must not classify a request as a tracker without deterministic evidence.
- AI must not silently enrich user browsing data through a backend.
- AI must not make safety, MITM, Sybil, or deletion claims.
- AI must not replace local tracker DB validation, tests, or human review.

## Relationship to the Proof Site

The current Proof site is a public Vite/React site that demonstrates browser-local presence, passive exposure, and behavioral signal capture. The extension is a separate product surface and should live as an `extension/` package or separate repository.

Use the Proof site as:

- A first-party observation test fixture.
- A source of vocabulary for signal categories.
- A demonstration environment for passive browser exposure.
- A place to explain why browser-level blocking does not delete source-held records.

Do not use the Proof site as:

- The extension runtime.
- The extension storage model.
- A reason to treat first-party instrumentation as invisible.
- A backend for browsing telemetry.

The extension must classify Proof's own instrumentation honestly when installed and run against the site.

## Build Commands

Use Plasmo-first commands.

Firefox targets MV2 initially because Firefox channels vary in MV3 support; this is revisited as part of Phase 2 Firefox adapter parity work (see Product Roadmap).

```bash
pnpm create plasmo pulse-observer-extension
cd pulse-observer-extension
pnpm install
pnpm dev
pnpm build --target=chrome-mv3
pnpm build --target=firefox-mv2
pnpm build --target=edge-mv3
```

Wrap the exact CLI form in `package.json` scripts so the project uses one stable command surface even if Plasmo target syntax changes later.

## package.json Scripts

```json
{
  "scripts": {
    "dev": "plasmo dev",
    "build:chrome": "plasmo build --target=chrome-mv3",
    "build:firefox": "plasmo build --target=firefox-mv2",
    "build:edge": "plasmo build --target=edge-mv3",
    "lint": "eslint . --ext .ts,.tsx",
    "design:check": "node scripts/check-design-primitives.mjs",
    "vocab:check": "node scripts/analyze-vocabulary.mjs --check",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:browser": "vitest --config vitest.browser.config.ts run",
    "test:e2e": "playwright test",
    "intel:check": "node scripts/check-intelligence-fresh.mjs",
    "intel:promote": "node scripts/promote-intelligence.mjs",
    "intel:promote:check": "node scripts/promote-intelligence.mjs --check",
    "qa": "pnpm lint && pnpm design:check && pnpm vocab:check && pnpm typecheck && pnpm test:coverage && pnpm intel:check && pnpm intel:promote:check && pnpm build:chrome",
    "qa:full": "pnpm qa && pnpm test:browser && pnpm test:e2e && pnpm build:firefox && pnpm build:edge"
  }
}
```

## Types

### ObserverEvent

```ts
export type ObserverEvent = {
  id: string
  tabId: number
  frameId?: number
  origin: string
  observedAt: number
  source: "network" | "content" | "api-hook" | "extension-scan"
  trackerId?: string
  companyId?: string
  firstParty: boolean
  policyLabel?:
    | "site_functionality"
    | "security_or_fraud"
    | "analytics"
    | "fingerprinting"
    | "behavioral_profiling"
    | "unknown_first_party"
  eventType:
    | "request_seen"
    | "request_blocked"
    | "script_injected"
    | "sdk_detected"
    | "extension_diagnostic"
    | "browser_surface"
    | "canvas_read"
    | "audio_fingerprint"
    | "webgl_query"
    | "font_enumeration"
    | "cookie_sync"
    | "cookie_observed"
    | "storage_write"
    | "indexeddb_access"
    | "cache_storage_access"
    | "service_worker_registered"
    | "cache_validator_seen"
    | "storage_respawn_suspected"
    | "webrtc_probe"
  blockability: BlockabilityClass
  status: ObservationStatus
  confidence: "confirmed" | "probable" | "weak"
  evidence: string[]
  count?: number
  details?: Record<string, string | number | boolean>
}
```

### SiteSummary

```ts
export type PageError = {
  id: string
  observedAt: number
  message: string
  stackPreview?: string
}

export type SiteSummary = {
  origin: string
  tabId: number
  activeCompanies: string[]
  blockedCompanies: string[]
  mitigatedCompanies: string[]
  exposedSignals: string[]
  cannotBlockSignals: string[]
  events: ObserverEvent[]
  pageErrors: PageError[]
  incomplete: boolean
  updatedAt: number
}
```

## Message Bus

```ts
export type RuntimeMessage =
  | { type: "OBSERVED_EVENT"; payload: ObserverEvent }
  | { type: "PAGE_ERROR_OBSERVED"; payload: Omit<PageError, "id"> }
  | { type: "GET_SITE_SUMMARY"; tabId: number }
  | { type: "SITE_SUMMARY"; payload: SiteSummary }
  | { type: "GET_VALUATION_ROLLUP"; period: "day" | "week" | "month" | "all" }
  | { type: "VALUATION_ROLLUP"; payload: RollingValuationSummary }
  | { type: "REFRESH_TAB_SCAN"; tabId: number }
  | { type: "GET_SETTINGS" }
  | { type: "SETTINGS"; payload: UserSettings }
  | { type: "UPDATE_SETTINGS"; payload: Partial<UserSettings> }
  | { type: "CLEAR_VALUATION_LEDGER" }
  | { type: "CLEAR_LOCAL_DATA" }
```

The UI must never directly inspect raw browser APIs. It reads normalized messages only.

## Testing Requirements

### Unit tests

- domain match logic
- path match logic
- status classification logic
- blockability resolution logic
- confidence resolution logic
- company grouping logic
- first-party policy labeling logic
- remediation lookup logic
- DB referential integrity

### Integration tests

- test page with Meta Pixel
- test page with FullStory
- test page with first-party canvas fingerprint logic
- test page with first-party behavioral capture
- test page with dynamic script injection
- test page with tag manager indirection
- plain page with no trackers

### Manual QA matrix

| Scenario | Chrome | Edge | Firefox | Expected |
| --- | --- | --- | --- | --- |
| Third-party pixel page | Yes | Yes | Yes | detected and blocked if configured |
| Session replay page | Yes | Yes | Yes | replay shown and ingest blocked if configured |
| First-party fingerprint page | Yes | Yes | Yes | passive exposure scan shown by default; invasive canvas/WebGL diagnostics only when explicitly enabled |
| Proof site | Yes | Yes | Yes | first-party instrumentation reported honestly |
| Restricted browser URL | Yes | Yes | Yes | factual unavailable state |
| Static page | Yes | Yes | Yes | no observers |

### Acceptance thresholds

- Popup renders under 150ms for an already scanned tab with 100 events.
- Common-path host lookup is effectively constant-time through in-memory maps.
- Content hooks avoid measurable page breakage on the test fixture set.
- DNR rules stay within browser rule limits.
- Packet inspection confirms observed browsing telemetry is not uploaded by the extension in v1.
- Plain-page false positives are investigated and either fixed or documented.
- Chrome, Edge, and Firefox builds expose the same normalized status model.

## Performance Requirements

- Popup render under 150ms for an already scanned tab.
- Common-path host lookup should be effectively constant-time via in-memory maps.
- Content hooks must avoid measurable page breakage.
- Service worker state must tolerate suspension and rehydration on Chromium.
- Per-origin summaries must remain compact enough for extension storage quotas.

## OSS Structure

Licensing:

- extension repo code: MIT
- bundled seed intelligence authored in this repo: MIT unless a specific file states otherwise after license review
- imported third-party intelligence must preserve source attribution, license notes, and compatibility review before it is vendored or distributed

Recommended repo layout:

```text
repo/
├── extension/
├── tracker-db/
├── docs/
│   ├── architecture.md
│   ├── threat-model.md
│   └── remediation-model.md
├── LICENSE
└── README.md
```

## Capability Backlog and Build Order

This backlog defines the larger product surface. Items must still pass threat-model review, browser API feasibility checks, and QA gates before implementation. Browser-visible evidence is required; do not claim compromise, safety, MITM, or Sybil detection without directly supportable local evidence.

### Core observation

- Third-party tracker requests.
- First-party fingerprinting.
- Dynamic script injection.
- Tag manager loading chains.
- Session replay libraries.
- Pixels and beacon endpoints.
- Cookie sync and ID sync requests.
- WebSocket observer endpoints.
- Third-party iframes.
- Known tracker CNAME or proxy patterns.
- Unknown newly injected remote scripts.

### Fingerprinting surfaces

- Canvas `toDataURL`.
- Canvas `getImageData`.
- WebGL `getParameter`.
- WebGL renderer and vendor reads.
- AudioContext and OfflineAudioContext rendering.
- Font enumeration attempts.
- Plugin and MIME type reads.
- Screen, viewport, and device-pixel-ratio reads.
- Timezone and locale reads.
- Hardware concurrency and device memory reads.
- Battery API reads where exposed.
- Gamepad and sensor API reads where exposed.
- WebRTC local candidate gathering.
- Permissions API probing.
- Media devices enumeration.
- Clipboard permission probing.

### Network and tracker blocking

- DNR rules from the local tracker DB.
- DNR matched-rule reporting where the browser exposes it.
- EasyPrivacy-compatible rule import.
- Domain suffix matching.
- Path signature matching.
- Request type matching.
- Initiator and context matching.
- First-party proxy detection.
- CNAME tracker detection.
- Per-site allow and disable controls.
- Per-category allow and disable controls.
- Rule provenance display.
- False-positive report export.

### Source-level remediation

- Company ownership grouping.
- Parent company display.
- What each observer collects.
- What each observer monetizes for.
- Future collection opt-out URL.
- Deletion request URL.
- Identity verification requirement.
- Friction class.
- Recheck or reminder interval.
- Plain `blocking does not delete prior records` statement.
- Jurisdiction notes.
- Vendor privacy contact.
- Exportable remediation checklist.

### Security and integrity indicators

- HTTP downgrade.
- Mixed content.
- Punycode origin.
- Lookalike domain.
- Suspicious redirect chain.
- Open redirect indicators.
- Cross-origin form submit.
- Password field posting to third-party origin.
- Token in URL.
- Auth code or OAuth token in referrer risk.
- Sensitive query parameters sent to third parties.
- Unsafe `postMessage("*")`.
- `postMessage` from unexpected origin.
- Third-party script touching auth forms.
- CSP missing or weak.
- `frame-ancestors` missing.
- Referrer-Policy missing or permissive.
- Permissions-Policy missing or permissive.
- X-Frame-Options absent on sensitive pages.
- Service worker registered by the current site.
- Service worker scope changes.
- New remote script after user interaction.
- Script integrity missing for CDN scripts.
- Known risky script origin.
- Extension messaging misuse indicators.

### Persistence surfaces

- Cookie metadata observed through request/response evidence, JavaScript-visible writes, or optional browser cookie APIs.
- `HttpOnly` cookie metadata where the optional `cookies` permission exposes it; never raw values.
- Partitioned cookie state where exposed by the browser.
- `localStorage` set/delete/clear metadata.
- `sessionStorage` set/delete/clear metadata.
- IndexedDB database open/delete/version-change metadata.
- Cache API open/put/delete/match metadata.
- Service worker registration, update, unregister, and scope metadata.
- `ETag`, `If-None-Match`, `Last-Modified`, and cache-validator header evidence.
- Same identifier digest appearing across multiple persistence surfaces.
- Same identifier digest reappearing after a user-triggered clear/delete attempt.
- Tag-manager-assisted storage fanout, where one loader enables multiple downstream storage writers.

Use `persistence surface` or `possible respawn behavior` language for this family. Do not claim a supercookie unless repeated, local, redacted evidence shows durable reappearance across storage surfaces or after a clear/delete attempt.

### Bot, automation, and identity-consistency indicators

- WebDriver exposed.
- Headless browser hints.
- Emulator-like WebGL renderer.
- Impossible hardware profile combinations.
- Timezone, IP, and browser-locale mismatch.
- Rapid repeated account or session creation indicators when visible.
- LocalStorage or sessionStorage identity churn.
- Multiple identities in one browser profile.
- Suspicious login redirect loops.
- Reused device fingerprint across different app identities when the app exposes them.
- High-rate form submission patterns.
- Disposable email domains in forms when visible locally.
- Repeated OAuth account switching in one origin.

Use `identity consistency indicator` language for this family. Do not claim local Sybil detection; true Sybil detection requires backend graph or behavior correlation.

### Privacy leak indicators

- Email address in URL.
- Phone number in URL.
- Name or address in query parameters.
- Session token in URL.
- JWT in URL.
- API key in URL.
- Referrer leaking path or query to third party.
- Third-party image or script loaded from a sensitive route.
- Form field names suggesting PII on third-party action.
- LocalStorage keys that look like tokens.
- SessionStorage keys that look like tokens.
- IndexedDB names suggesting identity or session storage.
- Cache names suggesting identity or session storage.
- Cookie names suggesting identity, auth, session, or cross-site correlation.
- Cookies without `Secure`.
- Cookies without `SameSite`.
- Cookies accessible to JavaScript where likely auth-sensitive.

### Content script and DOM observation

- Script tag insertion.
- Iframe insertion.
- Pixel image insertion.
- Hidden form insertion.
- Form action changes.
- Link `href` changes to suspicious origins.
- Meta refresh redirects.
- History API route changes.
- Shadow DOM script placement.
- Third-party SDK initialization globals.
- Consent manager events.
- Tag manager `dataLayer` pushes.
- Replay recorder globals.

### Extension product UX

- `Watching now`.
- `Blocked`.
- `Still exposed`.
- `Cannot block`.
- `Stop at source`.
- `What blocking changes`.
- Evidence drawer.
- Copy output.
- Export diagnostic bundle.
- Per-site summary.
- Per-company grouping.
- Per-signal grouping.
- Confidence labels.
- `Why this is classified this way` explanation.
- Rule and source provenance.
- Local data clear.
- Retention settings.
- Mitigation toggles.
- Per-site pause.
- Per-category pause.
- DB version display.
- Last updated timestamp.
- Unsupported page state.
- Permission missing state.
- Browser parity warning.

### Opt-in AI assistance backlog

- Local template explanation for observer events.
- `Explain this tab report` action.
- AI payload preview modal.
- Redaction pass before send.
- Provider setting: none, bring-your-own key, local endpoint, or local model.
- Local-only storage for provider configuration.
- Per-field data sharing toggles.
- Report-level AI summary.
- Event-level `Explain with AI` after report-level flow is safe.
- Deletion request draft generated from remediation metadata.
- False-positive report draft generated from deterministic evidence.
- Intelligence-pipeline assistant for DB curation, outside the extension runtime.
- AI prompt contract tests.
- Redaction tests for URLs, tokens, cookies, storage values, and form-like keys.

### Data and intelligence infrastructure

- DuckDuckGo Tracker Radar importer.
- EasyPrivacy importer.
- Local normalized tracker DB.
- Company DB.
- Remediation DB.
- Source and provenance fields.
- License and attribution metadata.
- Rule transform snapshots.
- Golden fixture pages.
- False-positive fixtures.
- DB schema validation.
- DB referential integrity.
- DB versioning.
- Signed DB update manifest.
- Signature verification.
- Rollback to last valid DB.
- Guaranteed local-only mode.

### Testing and QA backlog

- Unit tests for matching.
- Unit tests for blockability and status resolution.
- Unit tests for first-party policy labels.
- Unit tests for shared summary metrics; popup and report must not recompute headline counts inline.
- Unit tests for valuation ledger visit, tracker-presence, period, and pruning rules.
- DB schema tests.
- DB referential integrity tests.
- Design primitive drift guard.
- Vocabulary contract drift guard.
- Intelligence freshness guard.
- Runtime intelligence promotion drift guard.
- EasyPrivacy transform snapshot tests.
- Tracker Radar transform snapshot tests.
- Browser-mode tests for DOM hooks.
- Chromium extension E2E.
- Firefox extension E2E.
- Edge build verification.
- Fixture: no trackers.
- Fixture: Meta Pixel.
- Fixture: Google Analytics.
- Fixture: FullStory.
- Fixture: Hotjar.
- Fixture: first-party canvas.
- Fixture: WebGL fingerprint.
- Fixture: audio fingerprint.
- Fixture: dynamic script injection.
- Fixture: tag manager indirection.
- Fixture: token leak.
- Fixture: cross-origin form.
- Fixture: `postMessage` risk.
- Fixture: CNAME or proxied tracker.

### Strict non-goals and wording guardrails

- Do not say `safe`.
- Do not say `MITM detected` unless directly proven by browser-exposed evidence, which is rare.
- Do not say `Sybil detected`.
- Do not say blocking deleted past data.
- Do not upload browsing telemetry in v1.
- Do not hide hooks with stealth spoofing without an explicit ethics and security review.
- Do not vendor noncommercial datasets into an MIT repo without license review.
- Do not make Supabase required for extension runtime.
- Do not enable AI by default.
- Do not let AI become the evidence or the blocking decision engine.
- Do not send browsing telemetry to AI without a user-reviewed payload and explicit confirmation.

### Recommended build order

1. Finish current commits cleanly.
2. Tracker DB governance fields and standards.
3. Popup company and remediation cards.
4. Options settings that actually change behavior.
5. Opt-in diagnostic/mitigation mode design.
6. Canvas/WebGL/audio hooks only after page-breakage fixtures pass.
7. Network seen/blocked UI.
8. EasyPrivacy import pipeline.
9. Tracker Radar metadata pipeline.
10. Security indicators module.
11. Privacy leak indicators.
12. Firefox parity.
13. Signed DB update mechanism.
14. Observe page release flow and versioned downloads.
15. Opt-in AI report explanation with payload preview and redaction.

## LLM Implementation Checklist

Use this as the execution checklist. Every item must be completed or explicitly marked not applicable.

### Checklist: Project setup

- [ ] Create a new Plasmo project.
- [ ] Add TypeScript, ESLint, and Vitest.
- [ ] Create `src/core`, `src/adapters`, `src/background`, and `src/ui` structure.
- [ ] Add build scripts for Chrome, Firefox, and Edge.
- [ ] Document permissions with rationale.

### Checklist: Core domain

- [ ] Define `ObserverEvent`, `SiteSummary`, `BlockabilityClass`, and `ObservationStatus` types.
- [ ] Implement domain matching utilities.
- [ ] Implement path matching utilities.
- [ ] Implement classification logic.
- [ ] Implement status resolution logic.
- [ ] Implement confidence and evidence generation.
- [ ] Implement first-party policy labeling.
- [ ] Implement remediation lookup logic.

### Checklist: Database

- [ ] Create `trackers.json`.
- [ ] Create `companies.json`.
- [ ] Create `remediation.json`.
- [ ] Seed at least 25 high-value trackers/vendors.
- [ ] Index the database into in-memory lookup maps.
- [ ] Validate schema versions and referential integrity.
- [ ] Document update and false-positive review process.

### Checklist: Background runtime

- [ ] Implement event router.
- [ ] Implement tab-scoped summary store.
- [ ] Implement message handling for popup requests.
- [ ] Implement Chromium request handling.
- [ ] Implement Firefox request handling adapter.
- [ ] Implement service-worker rehydration behavior.
- [ ] Implement failure-state reporting.

### Checklist: Content scripts

- [ ] Implement DOM mutation watcher.
- [ ] Implement non-invasive browser-surface exposure scan.
- [ ] Implement opt-in canvas hook.
- [ ] Implement opt-in audio hook.
- [ ] Implement opt-in WebGL hook.
- [ ] Implement font enumeration detection where feasible without default page mutation.
- [ ] Emit normalized observation events.
- [ ] Avoid collecting form values or page content.

### Checklist: Blocking

- [ ] Create Chromium DNR rules.
- [ ] Create Firefox interception adapter.
- [ ] Map outcomes to `blocked`, `mitigated`, `active`, and `cannot_block`.
- [ ] Map each outcome to a blockability class.
- [ ] Ensure UI can display every outcome.

### Checklist: Popup UI

- [ ] Build `Watching now` section.
- [ ] Build `Blocked` section.
- [ ] Build `Still exposed` section.
- [ ] Build expandable remediation cards.
- [ ] Add confidence display.
- [ ] Add evidence display.
- [ ] Add friction class display.
- [ ] Add `blocking does not delete prior records` note.
- [ ] Add failure-mode states.

### Checklist: Options page

- [ ] Add retention settings.
- [ ] Add mitigation toggles.
- [ ] Add local data clear action.
- [ ] Add DB version display.
- [ ] Add diagnostic export only if user-initiated and redacted.

### Checklist: Security and privacy

- [ ] Confirm no analytics are included.
- [ ] Confirm no observed browsing data is uploaded.
- [ ] Confirm no remote code loading.
- [ ] Confirm all permissions are justified and minimal.
- [ ] Confirm content hooks do not read form values.
- [ ] Confirm diagnostic exports are redacted.

### Checklist: Testing

- [ ] Write unit tests for matching and classification.
- [ ] Write unit tests for confidence, evidence, and first-party policy labeling.
- [ ] Write integration tests for known tracker pages.
- [ ] Write integration tests against the Proof site as a first-party observation fixture.
- [ ] Manually test Chrome build.
- [ ] Manually test Edge build.
- [ ] Manually test Firefox build.
- [ ] Validate popup parity across browsers.

### Checklist: Release prep

- [ ] Verify build outputs for Chrome, Edge, and Firefox.
- [ ] Write README with install and architecture notes.
- [ ] Add license files.
- [ ] Add sample screenshots.
- [ ] Document unsupported cases and known limitations.
- [ ] Document source-level remediation model.

## Acceptance Criteria

The build is complete only when all of the following are true:

- The extension runs on Chrome, Edge, and Firefox from one shared codebase.
- The popup can show a first-party fingerprinting page as observed even when no third-party tracker host exists.
- The popup clearly distinguishes blocked, active, mitigated, and cannot-block outcomes.
- Every observer card includes confidence and evidence.
- Every observer card includes a source-level remediation path or an explicit statement that none exists.
- Permission requests are documented and minimal for the chosen implementation.
- Failure states are factual and do not imply complete protection.
- No browsing telemetry is sent to a vendor backend in v1.
- The codebase has tests, linting, and a documented repo structure.
- Proof-site instrumentation is classified honestly when used as a fixture.

## Final Instruction to the Implementing LLM

Build the extension from this specification exactly. Prefer correctness, explicit status labeling, evidence-backed classification, and architecture clarity over flashy UI. Keep the browser adapter layer thin, keep the intelligence layer structured, and never treat first-party fingerprinting as invisible just because it is not third-party-hosted.
