---
title: Surface Contract — Popup, Report, Debug
description: Normative contract for what each user-facing surface is for, what it shows, and what it is forbidden to show.
owner: stephen
status: active
version: 1.5.0
lastReviewed: 2026-07-05
nextReview: 2026-08-05
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

The popup renders exactly this, in this order, and nothing else:

1. **Verdict sentence.** One sentence carrying the headline number with meaning attached: "14 watchers on this page. 3 gave you nothing back — worth $12–48/yr to them." (This is the existing VerdictBanner; it becomes the top, not a mid-page banner.)
2. **The watchers.** Top 3–5 by severity, worst first: name (or hostname if not yet classified), one category word, **the money** — the priced annual estimate of what that watcher extracts ("$420–$500/yr to them") or what the site pays it ("site pays $x/yr") — and a block toggle where blocking is offered. Then one line: "+9 more in the full report." The money column is not detail; it is the product's differentiator. A watcher list without the invoice is any blocker's list — showing *what you're worth to them* is the reason Pulse exists, so it survives every future decluttering. Unpriced and unclassified watchers show no figure (never an invented one).
3. **One primary action.** Open the full report.
4. **Footer.** Site origin · "Debug" link (opens Debug view).

**Deleted from the popup** (moves to Report or Debug, or dies):

- The metric tile row — all of it. The verdict sentence *is* the number with meaning; tiles were the number without it.
- The identified/not-classified sub-line and the category chip row (the watcher list carries this per-name).
- The "What do these numbers mean?" glossary (a UI that needs a glossary is the bug).
- Money detail / rolling value sections (Report).
- Blocked / Still exposed / Cannot block / Unclassified / Storage event sections (Report).
- Runtime details and diagnostics (Debug).

## Report tab contract

Four acts, in order. Each act is one section; appendices are collapsed by default.

1. **Verdict** — same sentence as the popup, verbatim.
2. **The picture** — the Connections graph (Network default; Actors / Money / Timeline lenses). Category breakdown chips live here, as the graph's caption.
3. **Who, and what you can do** — the full watcher list, grouped by functional category (Advertising, Analytics, Session Replay, Data Brokers, Marketing & Sales Tools, Unidentified), worst-first within groups. Block/opt-out actions inline. This absorbs the popup's old Blocked/Exposed/Cannot-block sections and the "Stop at source" material.
4. **The money** — value ledger summary with "show the math" disclosure.

Appendix (collapsed): exposure scan, evidence-type matrix, storage/cache observations, per-event tables.

**Deleted from the report:** the Summary metric-tile grid (12 tiles → the few that matter appear inside acts 1–3 with words around them); the Diagnostics section (Debug view).

## Debug view contract

A separate route (`report.html?view=debug`), linked from both product surfaces. Fail-open: shows everything, never curated for presentation. Contents: every SummaryMetrics field with its definition, raw event stream (all tiers, all sources), identified/unclassified/source-backed/site-tool ladders, eviction and cap stats, storage keys, diagnostics, page errors. This is where "Observations 43 / Events 96" lives — labeled as what they are (grouped evidence rows / raw log entries).

## Shared vocabulary

User surfaces (popup, report) may use only: **watcher / watching, blocked, can't be blocked, not yet classified, identified**, the six category names, and dollar estimates. Banned on user surfaces (debug-only): observation, event, signal, source-backed, evidence tier, exposure scan, diagnostic, persistence.

Exemption: report appendix content explicitly addressed to auditors may use pipeline vocabulary — an audit trail in euphemism would be less honest, not more. Enforcement: `src/core/report/vocabulary-guard.test.ts` (full-strictness scan of popup strings; act-title scan plus banned-section check on the report), wired into the prebuild gate.

## Congruence rules

- Every number on any surface derives from `summaryMetrics`, `functionalCategoryBreakdown`, or `rankObservers`. No surface-local counting.
- The popup's "+N more" must equal watching minus names shown.
- The popup verdict and report verdict are the same rendered component with the same inputs.
- Category grouping totals must sum to the watching count (enforced in tests already).

## Process rule

User-surface changes land in this document before they land in a component. If a request conflicts with this contract, the contract gets amended first — deliberately, in one place — instead of the surface quietly diverging.
