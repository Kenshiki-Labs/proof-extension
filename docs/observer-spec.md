---
title: "Pulse Browser Extension - LLM Build Specification"
description: "The full build specification for Pulse Observer: product definition, threat model, architecture, detection/blocking spec, and acceptance criteria."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-01
nextReview: 2026-09-29
version: "0.0.1"
status: draft
---

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

## Product Roadmap

### Phase 0: Trustworthy foundation

Goal: prove the extension can observe browser-visible evidence locally without a telemetry backend.

Required capabilities:

- Plasmo project with shared core and thin browser adapters.
- Zod-validated contracts and tracker DB files.
- Main-world first-party canvas observation.
- Isolated content-script bridge with duplicate suppression.
- Background event router with tab-scoped summaries.
- Local storage persistence and retention limits.
- Copy/export current tab report.
- Chrome MV3 build and E2E fixture proving page-script observation.

Done when:

- first-party canvas reads on the Proof site appear in the popup as evidence-backed events
- no browsing telemetry leaves the browser
- `pnpm qa` and Chromium extension E2E pass

### Phase 1: Launchable observer product

Goal: ship a narrow, honest public build from the Proof website while store approval is pending.

Required capabilities:

- `/observe` download page on the Proof site.
- Versioned Chrome MV3 downloadable artifact.
- Popup sections for `Watching now`, `Blocked`, `Still exposed`, `Cannot block`, `Stop at source`, and `What blocking changes`.
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

### Phase 2: Mitigation and parity

Goal: move from observation-only content hooks to controlled mitigation where browser APIs allow it.

Required capabilities:

- Settings-backed canvas mitigation.
- WebGL query observation and mitigation.
- Audio fingerprint observation and mitigation.
- Font enumeration observation where feasible.
- Options toggles that actually change runtime behavior.
- Firefox adapter parity for core observation and status labels.

Done when:

- `content_mitigatable` events become `mitigated` only when the hook changes or constrains the API result
- Chrome, Edge, and Firefox expose the same normalized event/status model

### Phase 3: Intelligence pipeline

Goal: make the tracker DB auditable, source-backed, and maintainable.

Required capabilities:

- DuckDuckGo Tracker Radar metadata importer.
- EasyPrivacy import/normalization pipeline.
- Source family, source version/date, license notes, and transform notes on records.
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
| Firefox | Required, separate adapter target because manifest/runtime behavior differs |
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
- CNAME-cloaked or first-party-proxied tracker endpoints where detectable by DB rules or script behavior.

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
- CNAME or first-party proxy indicators where available.

Examples:

- `connect.facebook.net`
- FullStory ingest endpoints
- Hotjar ingestion
- analytics beacons
- known fingerprinting vendor asset URLs

### Content detection

Observe:

- `HTMLCanvasElement.toDataURL`
- `CanvasRenderingContext2D.getImageData`
- `AudioContext`
- `WebGLRenderingContext.getParameter`
- dynamic `<script>` insertion
- optionally `RTCPeerConnection` local IP exposure attempts

Each content observation event must include:

- event type
- timestamp
- page origin
- probable script origin if available
- action taken: observe, mitigate, or block
- confidence
- evidence

### Adversarial and evasion cases

The implementation must explicitly handle or mark unsupported:

- CNAME cloaking.
- Tracker scripts proxied through first-party paths.
- Obfuscated dynamic script injection.
- Late-loaded iframes.
- Tag manager indirection.
- Consent-management events.
- Service worker-mediated requests.

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
  "schemaVersion": 1,
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
    "method": "network-block"
  },
  "confidence": "confirmed",
  "evidenceTemplate": [
    "Request matched FullStory domain or ingest path."
  ],
  "remediationId": "fullstory-default"
}
```

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
- The test suite must reject duplicate tracker ids, duplicate company ids, invalid remediation references, and malformed URLs.
- False-positive reports must be reproducible with a test page or captured event fixture.
- Remote DB updates are not required in v1. If added later, updates must be signed and verified before use.
- If DB parsing fails, the extension must keep working with the last valid local DB or a bundled fallback.

## UI Spec

### Popup layout

Sections, in this order:

1. `Watching now`
2. `Blocked`
3. `Still exposed`
4. `Cannot block`
5. `Stop at source`
6. `What blocking changes`

This is the canonical popup IA. Roadmap phases, acceptance criteria, and implementation tickets must use this same section order. `Cannot block` is required because non-blockable exposures are first-class evidence, not empty state copy. `What blocking changes` is required because browser blocking does not delete historical or source-held records.

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
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:browser": "vitest --config vitest.browser.config.ts run",
    "test:e2e": "playwright test",
    "qa": "pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build:chrome",
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
  source: "network" | "content" | "api-hook"
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
    | "canvas_read"
    | "audio_fingerprint"
    | "webgl_query"
    | "font_enumeration"
    | "cookie_sync"
    | "webrtc_probe"
  blockability: BlockabilityClass
  status: ObservationStatus
  confidence: "confirmed" | "probable" | "weak"
  evidence: string[]
  details?: Record<string, string | number | boolean>
}
```

### SiteSummary

```ts
export type SiteSummary = {
  origin: string
  tabId: number
  activeCompanies: string[]
  blockedCompanies: string[]
  mitigatedCompanies: string[]
  exposedSignals: string[]
  cannotBlockSignals: string[]
  events: ObserverEvent[]
  incomplete: boolean
  updatedAt: number
}
```

## Message Bus

```ts
export type RuntimeMessage =
  | { type: "OBSERVED_EVENT"; payload: ObserverEvent }
  | { type: "GET_SITE_SUMMARY"; tabId: number }
  | { type: "SITE_SUMMARY"; payload: SiteSummary }
  | { type: "REFRESH_TAB_SCAN"; tabId: number }
  | { type: "UPDATE_SETTINGS"; payload: Partial<UserSettings> }
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
| First-party fingerprint page | Yes | Yes | Yes | canvas/WebGL observation shown even without third-party host |
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

Recommended licensing:

- code: GPL v3
- intelligence database: CC BY-SA

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
- DB schema tests.
- DB referential integrity tests.
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
5. Canvas mitigation.
6. WebGL and audio hooks.
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
- [ ] Implement canvas hook.
- [ ] Implement audio hook.
- [ ] Implement WebGL hook.
- [ ] Implement font enumeration detection where feasible.
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
