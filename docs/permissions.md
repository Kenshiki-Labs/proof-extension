---
title: "Permissions"
description: "Store-review justification for every permission Pulse Observer requests: why it is needed, what it is not used for, what is stored locally, and what never leaves the browser."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-10
nextReview: 2026-09-29
version: "0.0.3"
status: draft
---

This document is the store-review permission justification required by the spec (`docs/observer-spec.md`, "Store-review permission posture"). It must stay in sync with the manifest generated from `package.json`. Current manifest requests:

- `activeTab`
- `declarativeNetRequest`
- `declarativeNetRequestFeedback`
- `scripting`
- `storage`
- `webRequest`
- Optional (runtime-requested): `cookies`
- Host permissions: `<all_urls>`

## Product context for reviewers

Pulse Observer is a browser-local observation console. It reports who is observing the current tab, what evidence supports that claim, whether the extension blocked or mitigated it, and how to stop collection at the source. Detection and UI are fully local: there is no vendor backend, no analytics SDK, no remote code, and no upload of observed browsing data in v1.

The permission set is broad in host scope but narrow in behavior. Broad host access exists so the extension can observe; every action it takes with that access is enumerated below and bounded by the storage and security rules in the spec.

## Permission-by-permission rationale

### `webRequest` — observation only, never blocking

Used to observe request metadata (URL, resource type, initiator, tab) so requests can be matched against the bundled tracker database and reported as evidence-backed `request_seen` events. It is **not** used for MV2-style request blocking: no blocking listeners are registered, and no request is modified or cancelled through this API. All blocking on Chromium MV3 goes through `declarativeNetRequest`.

### `declarativeNetRequest` — the only blocking path

Chromium MV3 removed blocking `webRequest`, so DNR is the required mechanism for blocking known tracker requests. Rules are generated locally from the bundled, provenance-reviewed tracker database. Rule counts stay within browser limits, and rule provenance is visible in the product.

### `declarativeNetRequestFeedback` — honest block reporting

Used solely to observe matched-rule feedback so the UI can report a request as `blocked` only when a block deterministically occurred. This enforces a core product rule: no claimed protection without evidence. Where this feedback is unavailable, the UI degrades to `seen`/`active` rather than claiming a block.

### `storage` — local settings and compact summaries

Stores user settings, the tracker DB version, reminder timestamps, and compact per-origin summaries. Retention is user-configurable (default 14 days), per-tab event state is capped (default 100 events), and the options page provides a one-click local data clear. It does not store raw long-term browsing logs, page content, form values, or credentials.

### `scripting` + static content scripts — evidence collection in the page

A static content script (declared in the manifest, `document_start`) observes DOM script insertion and runs the passive browser-surface exposure scan. `scripting` covers injection where the static declaration is insufficient (for example, popup-triggered rescans). Content scripts are non-invasive by default: they do not monkey-patch rendering APIs on ordinary page load, do not read form values, and do not read page content. Invasive diagnostics (canvas/WebGL/audio hooks) are opt-in settings, off by default.

### `activeTab` — popup context

Lets the popup resolve the active tab so it can request that tab's summary from the background worker. Used for scoping the UI, not for extra content access.

### `cookies` (optional) — persistence-surface metadata, requested at time of use

Declared under `optional_permissions` and requested at runtime (`chrome.permissions.request`) only when the user invokes the persistence-observer feature; the extension functions without it. It is used to read cookie metadata (`cookies.getAll` scoped to the inspected origin) — name, domain, flags, expiry, including `HttpOnly` metadata where the browser exposes it — so persistence and respawn behavior can be reported as evidence. Raw cookie values are not stored, exported, or uploaded. Any local keyed digest for respawn diagnostics is retention-bound, cleared by `CLEAR_LOCAL_DATA`, and labeled as diagnostic evidence rather than a raw identifier. Runtime consumer: `src/core/browser/cookie-store.ts`.

## Why `activeTab` alone is insufficient

The product's core claim is passive observation: telling the user who was already watching before the user suspected anything. `activeTab` grants access only after a user gesture on a specific tab, which means:

- Tracker requests fired during page load — the majority of the evidence — would be invisible, because the grant arrives after the collection already happened.
- The user would have to know a site is worth inspecting before the extension could observe it, inverting the product's purpose.
- First-party fingerprinting and dynamic script injection detection require a content script present from `document_start`, which a post-hoc grant cannot provide.

## Why `<all_urls>` host permission is needed

- **Network visibility:** `webRequest` observation and DNR matching must see requests on any site the user visits, because trackers are on arbitrary sites — that is the problem being reported.
- **Content evidence:** the isolated content script must load at `document_start` on ordinary pages to observe script injection and run the exposure scan before trackers finish their work.
- A curated site list would silently miss exactly the long tail of sites where users most need observation, and the extension would have to overclaim ("no observers") on unlisted sites.

## What data is stored locally

- User settings (retention days, per-tab event cap, mitigation toggles).
- Tracker DB version metadata.
- Compact per-origin summaries (observer/company ids, signal types, status labels, timestamps, short evidence strings).
- Reminder timestamps for remediation rechecks.

Raw per-tab event state is memory-only in the background worker and subject to the per-tab cap and retention pruning.

## What is never collected or uploaded in v1

- No browsing telemetry leaves the browser. There is no vendor backend, no analytics SDK, and no remote code loading.
- Page content, form values, cookies, localStorage/sessionStorage values, credentials, and tokens are never read by content hooks and never stored.
- Copy/export actions are user-initiated and produce a local artifact the user controls.
- The AI audit-report feature is opt-in and user-initiated: it runs only when the user explicitly clicks Generate, only for `.gov` origins (verified against the tab's real URL in the background worker), and sends only the report's evidence summary — the same payload shown by the copy action — to Kenshiki's audit endpoint (`worker/ai-audit-proxy`), which forwards it to the AI model. The API credential lives in that service, never in the extension. No browsing data is sent anywhere automatically (see `docs/observer-spec.md`, "Opt-In AI Assistance").

## User controls: pause, clear, limit

- **Clear:** the options page has a local data clear action (`CLEAR_LOCAL_DATA`) that removes stored summaries and resets state.
- **Limit:** retention days (1–365, default 14) and max events per tab (1–500, default 100) are user-settable in options.
- **Pause:** disabling the extension from the browser's extension manager fully stops observation; per-site and per-category pause controls are on the product backlog and will be documented here when shipped.

## Fallback posture if broad host permissions are rejected

If a store review rejects `<all_urls>`, the fallback release mode is explicit per-site enablement (`activeTab` plus optional host permissions requested at the moment of need). In that mode the popup must label the result as **lower visibility, not equivalent protection**: pre-grant page-load requests are unobservable, and the extension must say so rather than imply completeness.

## Review checklist for manifest changes

Any change to `permissions` or `host_permissions` in `package.json` requires:

1. Updating this document in the same commit.
2. Confirming the new permission has a runtime consumer (no speculative grants).
3. Confirming the storage and security rules in `docs/observer-spec.md` still hold.
