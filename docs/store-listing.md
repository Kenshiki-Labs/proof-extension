---
title: "Store listing"
description: "Paste-ready Chrome Web Store listing copy for Pulse Observer: detailed description, single purpose statement, and pointers to the permission justifications."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-10
nextReview: 2026-09-29
version: "0.0.1"
status: draft
---

Copy for the Chrome Web Store item edit page. Permission justifications live in `docs/permissions.md`; keep both in sync with the manifest generated from `package.json`.

## Name

Pulse Observer

## Single purpose description (Privacy practices tab)

Pulse Observer is a browser-local observation console: it shows the user which trackers are observing the current tab, the evidence behind that claim, whether the request was blocked, and how to stop collection at the source. All detection runs locally; no browsing data leaves the browser.

## Detailed description (listing tab)

Pulse Observer answers four questions about the page you're on right now:

1. Who is observing this page?
2. What are they collecting?
3. Was it blocked, partially mitigated, or not stopped?
4. What is the path to stop collection — or delete already-held records — at the source?

Every observer named in the panel is backed by evidence: a network request matched against a provenance-reviewed tracker database, a script insertion seen in the page, or a browser-surface exposure the page could read. When a request was blocked, Pulse Observer says "blocked" only when the browser confirmed the block deterministically — no claimed protection without evidence. When it can't confirm, it says "seen" instead of overclaiming.

Pulse Observer is not a generic ad blocker. It is an evidence panel first and a mitigator second: its job is to show you who was already watching before you suspected anything, and to route you to the source-level remediation that actually ends the collection — opt-out, deletion request, or settings change at the company that holds the data.

Private by design:

- All detection, matching, and reporting run locally in your browser. There is no vendor backend and no analytics SDK.
- No browsing telemetry leaves the browser. Page content, form values, cookie values, and credentials are never read or stored.
- Stored data is limited to your settings and compact per-site summaries, with user-configurable retention (default 14 days) and a one-click local data clear.
- The optional AI audit report (available on .gov sites) runs only when you explicitly ask, and sends only the report's evidence summary to Kenshiki's audit service — never your browsing history.

Pulse Observer is in beta: it names source-backed trackers it recognizes today, and says so plainly when an observer remains unclassified. Treat it as local evidence, not a complete privacy audit.

## Privacy practices tab — quick answers

- Single purpose: paste from above.
- Permission justifications: paste per-permission text from `docs/permissions.md` (webRequest, declarativeNetRequest, declarativeNetRequestFeedback, storage, scripting, activeTab, cookies (optional), host permissions).
- Remote code: **No, I am not using remote code.** All code is bundled at build time; `executeScript` only runs inline functions, never remote files.
- Data usage certification: detection is local-only; every network egress is user-initiated — (1) the opt-in AI audit request sending the evidence summary to Kenshiki's audit proxy (API credential stays server-side), (2) the click-to-reveal location lookup against Kenshiki's session-profile endpoint (server reads caller IP; approximate geo returned), and (3) the Contract view fetching the visited site's own linked policy documents. See `docs/permissions.md`, "The complete egress inventory". Certify after confirming this still holds for the release being published.
- Privacy policy URL: `https://proofyouarehuman.com/privacy` (the footer's Privacy link). REQUIRED before submitting: that page must disclose the extension's practices — paste-ready section below.

## Privacy policy section for proofyouarehuman.com/privacy

> ### Pulse Observer browser extension
>
> The Pulse Observer extension observes tracker activity locally in your browser. All detection, matching, and reporting run on your device. The extension has no analytics, does not phone home, and never transmits your browsing history, page content, form values, or cookie values anywhere.
>
> Data stored locally on your device: your settings, and compact per-site summaries of observed tracker activity (retention is configurable, 14 days by default, with a one-click clear).
>
> Three features make network requests, each only when you explicitly trigger them:
>
> - **AI audit report** (available on .gov sites): when you click Generate, the report's evidence summary — the same text shown by the Copy action — is sent to our audit service, which forwards it to an AI model to produce the report. We do not store these payloads. The response is shown to you and kept only on your device.
> - **Location reveal**: when you click reveal, our session-profile service reads your IP address from the request (as any website you visit can) and returns an approximate, city-level location so the extension can show you what trackers already learn silently. We do not use this to build profiles.
> - **Contract audit**: when you open the Contract view, the extension fetches the visited site's own linked legal documents (privacy policy, terms) from that site, on your behalf, to compare them with observed behavior. Nothing is sent to us.
>
> The extension requests broad host permissions solely to observe tracker requests on the pages you visit; this access is never used to collect, transmit, or sell browsing data.

## Assets

- Store icon (128×128): `assets/store/icon-128.png` (upscaled from the 50×50 fingerprint mark `assets/icon.png`; replace with a native ≥128px export when available).
- Screenshots: at least one, 1280×800 or 640×400, taken from the running extension.
