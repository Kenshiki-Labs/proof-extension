---
title: Surface Contract — Popup, Report, Debug
description: Normative contract for what each user-facing surface is for, what it shows, and what it is forbidden to show.
owner: stephen
status: active
version: 1.8.1
lastReviewed: 2026-07-06
nextReview: 2026-08-06
---

# Surface Contract

## Purpose — what this product is

Pulse is **not a privacy tool**. It does not promise protection, and its success is never measured in things blocked. It is an **extraction meter**: an evidence instrument that makes visible what the data-surveillance and advertising industry takes from a person just living their life online. The parent thesis (the proof site): *"Your presence is already legible. The only question is who is reading it — and whether they show you the instrument panel."* This extension is the instrument panel — and its particular job is the part **you cannot see, cannot block, and no one tells you about**. Blocking and opt-outs are levers offered after seeing — never the headline.

Every surface exists to answer two questions, and is judged by how directly it answers them:

1. **Extraction — "What is this industry taking from me, just living my life?"** Measured in two currencies:
   - **Dollars** — what your attention and profile are worth to the companies watching, per year (the value ledger).
   - **Bits** — how much identifying information the industry got access to, against the ~33-bit ceiling that makes a person unique on Earth. The unit of account is **capability, not caught behavior**: any third-party script that executed in the page render had the full passive surface (everything the proof site demonstrates — no probe required, presence is the grant), while request-only contact still yielded IP, user-agent, referrer, and its cookies. Observed probes (canvas, fonts, audio) are additions on top of the floor, never the floor itself. Every watcher is reported in three epistemic tiers: **had access to** (the floor, classified from render presence vs. request contact), **observed taking** (our event stream), and **not knowable from the browser** (actual payloads, server-side joins — stated explicitly, because silence implies "nothing more happened"). Per-surface entropy estimates must be sourced from published population studies through the intelligence pipeline, never from memory.
   A life is not one page view — the cumulative answer outranks the per-page snapshot wherever both fit.
2. **Scope — "How much of it can I actually see?"** Everything that crossed the wire, including parties no tracker database names and surfaces that are not network traffic at all. Other tools show their list; Pulse shows the wire — and says so. Coverage is never curated down to the comfortable subset, and the scope guarantee is stated on-surface, not delivered silently.

**The consent gap is the product's sharpest exhibit.** The capability floor is taken with zero consent and is untouched by any cookie choice — declining a banner governs cookies, not capability. Pulse observes both sides at once: the page's consent apparatus (`consent_signal_observed` — TCF/USP/GPP plumbing) and the extraction that proceeds regardless of the user's answer. Wherever a consent signal is present, surfaces state the juxtaposition: what the banner governed, and what was taken anyway. This claim must stay strictly factual per the observer spec — the gap is shown, never editorialized.

A surface change that makes either question harder to answer is a regression regardless of how clean it looks.

The counting layer has one source of truth (`summaryMetrics` — "identical labels must mean identical math"). The presentation layer never got one, so surfaces accreted: every fix added a tile, a sub-line, a chip row, a panel, and nothing was ever deleted. This document is the presentation-layer equivalent. **A change to a user surface that is not reflected here first is drift by definition.**

## The three surfaces

One product, three attention budgets:

| Surface | Job | Attention budget | Failure mode it must avoid |
| --- | --- | --- | --- |
| **Popup** | The glance: am I being watched, by whom, what can I do | under 10 seconds | walls of numbers |
| **Report tab** | The story: picture → who → money → action | 2–5 minutes | database dump |
| **Debug view** | Everything, fail-open: raw reality for diagnosing the pipeline | unbounded | leaking into the other two |

The debug requirement ("we must be able to see everything, or we can't diagnose from the UI") is honored by giving debug its **own surface**, not by interleaving debug data into product surfaces.

## Popup contract

The popup renders exactly this, in this order, and nothing else. The order is deliberate: the exit action is fixed chrome at the top (always in the same place, never below a variable-height list), and the evidence follows.

1. **Header.** Product mark · value-ledger shortcut.
2. **Primary action.** Open the full report — fixed position, before the evidence, so the exit never moves.
3. **The mirror.** The actual values this page could read: timezone, screen/pixel ratio, platform/language, and request-contact context. Then one narrowing sentence: "That narrows 330,000,000 people to about N." If no readable surface has arrived yet, this block is absent rather than padded with placeholders.
4. **Verdict sentence.** One sentence carrying the headline watcher number with meaning attached: "14 watchers on this page. 3 gave you nothing back — worth $12–48/yr to them."
5. **Stopped-value line.** Present only when the user's own choices fired: "N watchers blocked, M mitigated here — about $X of this visit's estimated value stayed with you." Blocked and mitigated counts stay separate (they are different user choices), the scope is named per-visit so it reads as related to — not contradicting — the verdict's annual range, and the line appears directly under the verdict because it is a verdict-tier fact.
6. **The watchers.** Top 3–5 by severity, worst first: name (or hostname if not yet classified), one category word, **the money** — the priced annual estimate of what that watcher extracts ("$420–$500/yr to them") or what the site pays it ("site pays $x/yr") — and block/mitigate toggles where offered. Then one line: "+9 more in the full report." The money column is not detail; it is the product's differentiator. A watcher list without the invoice is any blocker's list — showing *what you're worth to them* is the reason Pulse exists, so it survives every future decluttering. Unpriced and unclassified watchers show no figure (never an invented one).
7. **Visit-frequency ask.** One question, once per domain, because the annual figures are honest only when calibrated to how often the user is actually here.
8. **Cookie-metadata toggle.** The opt-in capability grant lives at the moment of use.
9. **Footer.** Site origin · "What you agreed to" (Done vs. declared view) · "Debug" link.

**Deleted from the popup** (moves to Report or Debug, or dies):

- The metric tile row — all of it. The verdict sentence *is* the number with meaning; tiles were the number without it.
- The identified/not-classified sub-line and the category chip row (the watcher list carries this per-name).
- The "What do these numbers mean?" glossary (a UI that needs a glossary is the bug).
- Money detail / rolling value sections (Report).
- Blocked / Still exposed / Cannot block / Unclassified / Storage event sections (Report).
- Runtime details and diagnostics (Debug).

## Report tab contract

Five evidence acts, plus one focused local-state surface. Each act is one section; appendices are collapsed by default.

1. **Verdict** — same sentence as the popup, verbatim.
2. **The narrowing** — the mirror expanded into a candidate-pool chain using the same additive model as the proof app. It starts from 330,000,000 and shows only readable values that were actually observed by the exposure scan. It states that the model is estimated and that joint entropy is lower than a naive independent sum.
3. **The picture** — the Connections graph (Network default; Actors / Money / Timeline lenses). Category breakdown chips live here, as the graph's caption.
4. **Who, and what you can do** — the full watcher list, grouped by functional category (Advertising, Analytics, Session Replay, Data Brokers, Marketing & Sales Tools, Unidentified), worst-first within groups. Block/opt-out actions inline. This absorbs the popup's old Blocked/Exposed/Cannot-block sections and the "Stop at source" material.
5. **The money** — value ledger summary with "show the math" disclosure, split by outcome when the user's choices fired: value that reached watchers, value denied by blocks, value mitigated locally. One word per intervention everywhere: the watcher list's toggle, the money table's outcome column, and the popup line all say "mitigated" — never "shim" (engineering vocabulary) on a product surface.

The AI audit narrative is not a report view: it renders as an eligibility-gated section at the end of the evidence acts, only on .gov pages, because a permanent tab that is a dead end on every other page fails the taxonomy.

**Local State tab** — a separate report view labeled "Local state", not part of the Evidence story and not an appendix. Its job is to answer: "What did this site leave in my browser that may persist after this page?" It rolls up browser-local state across cookies, Web Storage, IndexedDB, Cache Storage, service workers, and cache validators. The headline is an interpretation, not a dump: total local-state mechanisms, script-readable vs browser-only records, session vs durable records, background-capable workers, and any cross-surface respawn suspicion. Raw rows are collapsed behind an audit disclosure.

Local State rules:

- It scans only the current page/current site the user is viewing or reporting on. A global opt-in may enable the capability, but it never turns into an all-browser cookie or storage inventory.
- Default reports never read, store, render, or infer values. Allowed default fields are names/keys after redaction, domains/origins, sizes/counts, timestamps, durability, and browser attributes such as HttpOnly, Secure, SameSite, session, storage family, and worker scope.
- Explicit local inspect mode may reveal current-site cookie or storage values only after a direct user action inside the Local State tab. Revealed values are ephemeral extension-page state: they are never written to `ObserverEvent`, summaries, storage, the value ledger, debug data, report copy/export, or any off-device request. The UI must provide a clear hide/clear action, keep values redacted until the user reveals a row, and state that HttpOnly values are browser-only data the page script itself cannot read.
- A Local State clipboard affordance may copy the tab's local-state rollup and raw metadata rows for support/debug handoff. It must exclude all explicitly revealed values and must state that copied output is metadata only.
- The useful sentence must describe consequence: script-readable state, browser-only state still sent by the browser, records that survive the session, background-capable state, and whether deletion/respawn behavior is suspected. "Cookie observed" or "Storage write observed" alone is insufficient product copy.
- A single cookie card grid is forbidden. Counts appear in dense strips or compact summaries; raw table rows are audit material.
- The tab label is **Local state**. "Persistence" is allowed in docs and code identifiers, but user-facing product navigation uses "Local state".

Appendix (collapsed): exposure scan, evidence-type matrix, storage/cache observations, per-event tables.

**Deleted from the report:** the Summary metric-tile grid (12 tiles → the few that matter appear inside acts 1–3 with words around them); the Diagnostics section (Debug view).

## Debug view contract

A separate route (`report.html?view=debug`), linked from both product surfaces. Fail-open: shows everything, never curated for presentation. Contents: every SummaryMetrics field with its definition, raw event stream (all tiers, all sources), identified/unclassified/source-backed/site-tool ladders, eviction and cap stats, storage keys, diagnostics, page errors. This is where "Observations 43 / Events 96" lives — labeled as what they are (grouped evidence rows / raw log entries).

## Shared vocabulary

User surfaces (popup, report) may use only: **watcher / watching, blocked, mitigated, can't be blocked, not yet classified, identified**, the six category names, dollar estimates, and Local State vocabulary: **local state, cookie, storage, browser-only, readable by page scripts, session, durable, background worker, cache**. Banned on user surfaces (debug-only): observation, event, signal, source-backed, evidence tier, exposure scan, diagnostic, persistence.

Exemption: report appendix content explicitly addressed to auditors may use pipeline vocabulary — an audit trail in euphemism would be less honest, not more. Enforcement: `src/core/report/vocabulary-guard.test.ts` (full-strictness scan of popup strings; act-title scan plus banned-section check on the report), wired into the prebuild gate.

## Congruence rules

- Every number on any surface derives from `summaryMetrics`, `functionalCategoryBreakdown`, `rankObservers`, or `buildNarrowingModel`. No surface-local counting.
- Local State numbers derive from named local-state rollup helpers (`buildLocalStateRollup`, `buildLocalStatePurposeRollup`, `buildCookieMetadataRollup`). No surface-local counting.
- The popup's "+N more" must equal watching minus names shown.
- The popup verdict and report verdict are the same rendered component with the same inputs.
- Category grouping totals must sum to the watching count (enforced in tests already).

## Process rule

User-surface changes land in this document before they land in a component. If a request conflicts with this contract, the contract gets amended first — deliberately, in one place — instead of the surface quietly diverging.
