---
title: Done vs. Declared — reconciling observed extraction with the site's own contract
description: Repurposes the Consumer Consent Atlas engine to run live against the site the extension is currently watching, then reconciles what the page DID (observed events) with what its legal documents SAY it can do — the disclosure gap is the product.
owner: stephen
status: draft
version: 0.2.0
lastReviewed: 2026-07-05
nextReview: 2026-08-05
---

# Done vs. Declared

## The zoom-out — three circles, and the product is the non-overlap

Three descriptions of the same page exist simultaneously, and they do not agree:

1. **Observed** — what the page *did*: the extension's evidence. Trackers contacted, canvas read, fonts enumerated, identifiers synced, IP visible to every request.
2. **Declared** — what the site's own legal documents *say it may do*: the privacy policy, terms, cookie policy. The contract nobody reads.
3. **Consented** — what the user actually *clicked yes to*: the banner. The smallest circle by far.

Every existing tool shows one circle. Ghostery shows observed. Policy summarizers show declared. CMPs administer consented. **Nobody reconciles them.** The product of this feature is the *deltas*:

| Delta | Meaning | Verdict language |
|---|---|---|
| **observed ∩ declared** | They did it, and the contract claims the right. | *"Caught in the act — with the receipt. Here is the clause."* |
| **observed − declared** | They did it, and **no clause we could find authorizes it**. | *"The disclosure gap."* The damning one. |
| **declared − observed** | The contract reserves rights beyond anything seen this session. | *"What you also agreed to — dormant powers."* |
| **declared − consented** | The banner governed cookies; the contract took far more. | *"Consent theater"* — completes the existing consent-gap concept in `docs/surface-contract.md`. |

This is not a policy summarizer bolted on as a third tab. It is the **reconciliation instrument**: the extension's observed evidence used as the *query* into the site's own contract. It keeps Pulse an **extraction meter** — the output is a measured gap, not a lecture about scary clauses.

## Why the extension is uniquely positioned to do this

The atlas crawler needed Playwright, a corpus, and a schedule. The extension needs none of that, because it is **already standing inside the page it wants to audit**:

- The content script can read the live DOM's anchors — the site's own "Privacy Policy" / "Terms" links — which is exactly the input `legal-links` classification wants. No crawler.
- `host_permissions: <all_urls>` lets the background worker fetch those documents cross-origin, directly, at the moment the user asks.
- The atlas detection engine (33 deterministic rules + severity rubric) is pure functions over text — it ports into the extension wholesale and runs in milliseconds.
- And the extension holds the one thing the atlas never had: **the observed event stream for this exact page, right now** — the other side of the reconciliation.

So the atlas engine is repurposed from "crawl the top 50 sites offline" to **"audit the site currently seen, on demand."** The bundled 32-site snapshot demotes to a cache/fallback; the live path is the product.

## The boundary (unchanged, restated)

> **A network call that harvests data from the user or monetizes them is forbidden. A network call that spends our resources to work for the user is fine.**

Fetching the current site's own public policy sends nothing about the user anywhere the site doesn't already see (the fetch goes to the site itself, which already has the user's IP from browsing it). The user's observed surface and event stream **never leave the browser** in the deterministic path.

## Pipeline — deterministic floor (Phase 1)

```
content script (already in page)          background worker                      Done vs. Declared tab
─────────────────────────────────         ─────────────────────────────          ─────────────────────
read document anchors (text+href) ──►     RUN_CONSENT_AUDIT(tabId):
publish to session storage               1. discoverLegalLinks(anchors)  ─ per docType best URL
                                          2. fetch(policy URLs)           ─ site's own public docs
                                          3. htmlToText → detectGiveups   ─ 33 rules, deterministic
                                          4. reconcile(events, giveups)   ─ the three deltas
                                          5. cache by domain+text_hash    ──►  render verdict + deltas
```

- **User-initiated.** The audit runs when the user opens the tab / clicks "Audit this site's contract" — not automatically on every page load. (Fetching several policy pages per navigation would be rude and noisy; on-demand is also the honest posture: this is an instrument reading, taken when asked.)
- **Cache** by `domain + text_hash` so repeat audits are instant and re-fetch only when the policy text changed.
- **Fallback**: if link discovery finds nothing (SPA footers, consent-walled policies), fall back to the bundled atlas snapshot for known domains; else an honest empty state. Pinned overrides (the atlas `overrides.js` pattern) can be carried over for known-hostile routes like CNN→wbdprivacy.com.

## Reconciliation — the deterministic mapping

Observed evidence classes (from `ObserverEvent.eventType` + party counting) map to the clause categories that would authorize them. **This mapping is a fixed table, not AI.** It must be honest about semantic distance — e.g. canvas fingerprinting is *device* fingerprinting, which lives under tracking/identification clauses, not "biometric" (a policy's "fingerprint" means your finger, not your GPU):

| Observed (evidence exists in this session) | Clause categories that would authorize it |
|---|---|
| Third-party trackers contacted (party-keyed) | `data_sharing_third_parties`, `tracking_advertising` |
| Ad/auction/identity-resolution parties specifically | `tracking_advertising`, `data_broker_enrichment` |
| Canvas read / font enumeration / WebGL query / audio fingerprint | `tracking_advertising` (tracking technologies), `sensitive_inference`, `cross_device_tracking` |
| Cookie sync / identifier hand-off observed | `data_sharing_third_parties`, `cross_device_tracking` |
| IP visible to N parties (capability floor) + location resolution shown in report | `location_tracking` |
| Consent banner observed (`consent_signal_observed`) | cookie-family clauses: `legitimate_interest_tracking`, `cookie_reject_friction`, `multi_click_cookie_rejection`, `non_private_defaults`, `confusing_cookie_notice` |

Reconciliation output per observed class: **authorized** (matching clause found — show the quote), **disclosure gap** (no matching clause found), plus the residue of **declared-but-dormant** clauses (detected clauses whose observed counterpart didn't occur this session — arbitration waivers, content licenses, AI-training use, retention…).

**The honesty rule for gaps** (non-negotiable copy constraint): a disclosure gap means *"no authorizing clause was found in the documents we could read"* — never *"no clause exists."* Extraction is regex over prose; policies are sprawling; absence of evidence is stated as exactly that. Same epistemic discipline as the three tiers in `docs/surface-contract.md`.

## Where AI enters (Phase 2 — the real unlock, still governed)

The deterministic mapping above is a fixed-table approximation: category-to-category. AI upgrades reconciliation from *category match* to *clause-level judgment*, and the observed events make the task **grounded** — not "summarize this policy" but:

> "This page read the canvas, contacted 29 third parties, and its server saw the user's IP. For each observed behavior, find the specific clause that authorizes it, quoting verbatim. State plainly when you find none."

- Input: the fetched **public** document text + a **redacted, typed digest** of observed evidence classes (event types and counts — never raw URLs, cookies, or identifiers), per `docs/ai-model-governance.md` §Data Provenance.
- Output gates (all three, same as before): **quote-grounding** (verbatim-substring check against the fetched text, else dropped), **deterministic severity** (`scoreGiveup`, category-selected factors — AI never sets a score), **Zod validation** at the boundary.
- Governance mapping: this is *"opt-in report explanation"* + *"intelligence curation"* composed; inventory entry required before release; kill switch reverts to the deterministic table.
- Provider key lives behind the Kenshiki gate, never in the extension.

```text
Deterministic evidence is the record.
AI explanation is commentary on the record.
```

The record here is: the observed event (already evidenced), the verified quote, the deterministic score. AI's only power is finding the needle in the prose faster and across phrasings no regex anticipated.

## Tab UX — "Done vs. Declared"

- **Verdict header** — one sentence, the instrument reading: *"We observed N extraction behaviors on <site>. Its own documents authorize X of them, are silent on Y, and reserve Z further rights you never saw exercised."*
- **Section 1 · Done, and declared** — observed behavior cards, each paired with its authorizing clause: the verbatim quote (visually primary), source doc + link, severity bar from `per_factor`, and a chip linking back to the observed evidence in the report.
- **Section 2 · Done, not declared** — the disclosure gap. Observed evidence, then: *"No authorizing clause found in the N documents we read."* Links to the documents read + their `text_hash`/timestamps, so the claim is auditable.
- **Section 3 · Declared, not (yet) seen** — dormant powers, sorted by deterministic score: arbitration, content license, AI training, retention, business-transfer. This is where the old "atlas card" view survives, demoted to third billing.
- **Consent-theater strip** — when `consent_signal_observed` exists: banner governed cookies; the contract above governs all of this; the readable surface existed regardless. Completes the existing consent-gap panel.
- **Provenance footer** — which documents were fetched, when, `text_hash`, rule/ontology version, and the standing caveat that absence of a clause in our read ≠ absence in the contract.
- Empty/failure states are honest: no links found → say so, offer snapshot if the domain is covered; fetch blocked → say so.

## Engine port (implementation, in progress)

`src/core/atlas/` — faithful TS port of the pure engine: `rules.ts` (33 detection rules, regexes preserved exactly), `legal-links.ts`, `extract.ts` (htmlToText, last-updated, FNV-1a text hash instead of node:crypto), `scoring.ts` (rubric `atlas-severity-1.0.0`, behavior-identical), `detect.ts` (detectGiveups with multi-match confidence), `types.ts` (Zod schemas; `GiveupCategory` derived from the ruleset). Proven two ways: parity test against the CNN fixture/output, and a live fetch of a real current policy through the ported pipeline. Reconciliation (`reconcile.ts`) sits on top and is extension-only — it has no atlas ancestor because the atlas never had the observed side.

## Phasing

1. **Deterministic reconciliation, live.** Engine port + content-script link discovery + background fetch/detect + fixed-table reconcile + the tab. No AI. Works on any site with discoverable public docs; snapshot fallback for 32 known domains.
2. **AI clause-level reconciliation** behind the gate, quote-grounded, deterministic scoring, opt-in.
3. **Longitudinal**: cache text_hash per domain over time → "this contract changed since you last read it" (`unilateral_changes`, made concrete).

## Validation

- Parity: ported engine reproduces the atlas's committed CNN findings from the same fixture text.
- Live: ported engine produces findings from a real policy fetched at test time.
- Reconciliation: fixture SiteSummary + fixture giveups → exact expected three-way split; canvas maps to tracking (not biometric); gap copy always says "found," never "exists."
- Surface congruence: observed counts shown in this tab come from the same party-keyed counters as the popup/report (`observer-counts.ts`) — one filter, everywhere.
- Guardrails: `design:check`, `vocab:check`, typecheck, and the AI governance inventory before Phase 2 ships.
