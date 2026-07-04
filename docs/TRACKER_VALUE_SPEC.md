# trackers.json — Per-Person Value Schema

## Overview

Every tracker record now includes a `perPersonValue` block that answers:
> **What is one person's data worth to this company, per visit and per year?**

This enables the Proof extension to show users:

- **Per-visit**: "This visit produced $0.0049 in modeled tracker presence."
- **Annual rollup**: "Observed trackers represent $312/year of modeled supply-chain value."

## Source of Truth

This document defines the valuation model and interpretation rules. Numeric valuation findings live in:

- `intelligence/source/valuations/market-research-2026.json`
- `intelligence/normalized/valuations.json`

Runtime `perPersonValue` blocks in `src/core/db/trackers.json` are promoted projections, not hand-authored source data. Run `pnpm intel:normalize && pnpm intel:promote` to update them. `pnpm intel:promote:check` fails if a runtime dollar figure drifts from the normalized valuation artifact.

`market_research` provenance supports valuation estimates only. It must not be used as evidence for tracker identity, collection behavior, blocking policy, ownership, or remediation claims.

---

## `perPersonValue` Block Structure

```json
"perPersonValue": {
  "schemaVersion": 1,
  "currency": "USD",
  "geography": "US",
  "userProfile": "average_adult_internet_user",
  "valueType": "revenue",           // or "cost" — see below
  "monetizationFlow": "platform_ads", // see flow taxonomy below
  "perVisit": {
    "microdollars": 768,            // 768 µ$ = $0.000768 per page visit
    "dollars": 0.000000768,
    "basis": "annualARPU ÷ estimated annual signals"
  },
  "annual": {
    "low_usd": 420,
    "high_usd": 500,
    "midpoint_usd": 460
  },
  "valueNote": "Google US ARPU ~$460/yr. Present on ~87% of sites.",
  "sourceNote": "Proton 2025: $460 US ARPU",
  "lastUpdated": "2026-07-03",
  "confidence": "sourced"           // or "estimated"
}
```

---

## `valueType`: Which Economic Rail Is Being Priced?

| Value | Meaning | Examples |
| --- | --- | --- |
| `"revenue"` | Ad-market or data-market value captured by tracker/ad-tech companies | Google Ads, Meta Pixel, Criteo, LiveRamp |
| `"cost"` | Site-paid software/tooling spend paid to tracking-tool vendors | Hotjar, Mixpanel, Segment, Braze |

**Consumer framing tip:**

- `"revenue"` trackers → "Ad-market value to trackers/ad-tech companies"
- `"cost"` trackers → "Site-paid tool fees to tracking-tool vendors"

Both are worth showing, but they are not one pot of money and should not be rendered as a simple pie. A tracker can sit inside a broader supply chain: advertiser spend, ad delivery, measurement, attribution, identity matching, site analytics, and future optimization feedback. This model prices only defensible rails and explicitly leaves site ad revenue, site margin, and unpriced ecosystem feedback as not estimated.

---

## Supply-Chain Interpretation

The value ledger must not present tracker value as a clean split among the user, the site, and a tracker. The real system is a supply chain:

- Advertiser money enters the ad rail first. Brands and agencies fund demand; DSPs, walled gardens, exchanges, SSPs, and publishers sit downstream.
- Walled gardens can collapse many roles into one company: buyer interface, seller interface, auction, measurement, and data provider.
- Open-web programmatic companies can sit on different sides of the same impression: DSPs buy access to an audience; SSPs help publishers sell slots; exchanges and identity/measurement layers take intermediary value.
- Publisher-side tools are a separate rail. Sites pay SaaS/tool vendors for analytics, session replay, CDP, support, experimentation, tag management, monitoring, and optimization.
- Basic collection can feed future value even when this ledger cannot price it directly: identity graphs, attribution models, conversion measurement, audience building, page optimization, and future targeting.

The product should therefore answer `who gets paid?` as:

| Bucket | What it means | What we do not claim |
| --- | --- | --- |
| Ad-market value to trackers/ad-tech companies | Modeled value on ad/data-market rails associated with observed trackers. | We do not estimate the site's ad revenue share, publisher margin, or exact take rate for each intermediary. |
| Site-paid tool fees | Modeled site spend on tracking/analytics/tool vendors. | We do not claim the user receives this money or that the tool directly sells an ad. |
| Money to user | Always `$0` in the current model. | We do not imply the user is compensated. |
| Ecosystem feedback | Data exhaust that may improve identity, attribution, optimization, and future targeting. | We flag this as unpriced; we do not add a hidden dollar amount. |

### Bill of Materials View

The full value-ledger surface should explain the supply chain as stages, because that is the missing user model. Use the stage map to show what the extension observes, prices, and refuses to overclaim:

| Stage | Product meaning | What the ledger may show |
| --- | --- | --- |
| Extraction / mining | Raw behavioral events enter from the browser: page views, clicks, scripts, pixels, SDKs, and device/browser signals. | Observation count, tracker count, site count, and `$0 to you`. |
| Refining | Raw events become identity, attribution, measurement, analytics, or profile material. | `identity_infra` valuation rollup when present; broader profile enrichment stays unpriced. |
| Audience parts | Refined profiles become segments, cohorts, scores, retargeting lists, and other reusable parts. | `Not separately priced`; no hidden dollar amount. |
| Auction assembly | Signals, demand, publisher context, creative, and price are assembled into one targeted impression. | Combined `platform_ads` and `programmatic` ad-market rollups. |
| Wholesale / exchange | DSPs, exchanges, SSPs, identity, and measurement layers move impressions in bulk. | `programmatic` rollup; no take-rate allocation. |
| Retail surface | The publisher page is the storefront shelf. Sites can earn residual ad revenue and pay tracking-tool vendors. | `operator_saas` site-paid tool-fee rollup; site revenue share remains not estimated. |
| Missing input contract | The raw-material source is the user, but the user is outside the payment ledger. | `$0 to you`; do not imply compensation. |

---

## `monetizationFlow`: Economic Model Taxonomy

| Flow | Description | Trackers |
| --- | --- | --- |
| `platform_ads` | Walled garden: user ARPU directly attributable to ad revenue | Google Ads, Meta Pixel, Amazon Ads, TikTok, LinkedIn, Pinterest, Snap, Reddit, X, Microsoft Ads |
| `programmatic` | Open-web CPM auctions: fractional per-impression value | The Trade Desk, Criteo, PubMatic, Magnite, OpenX, Index Exchange, Taboola, Outbrain, Quantcast, 33Across |
| `identity_infra` | Data broker / identity graph licensing | LiveRamp, Tapad, ID5, Lotame, 6sense |
| `operator_saas` | Site pays SaaS fee per tracked user | Hotjar, FullStory, Segment, Amplitude, Mixpanel, Braze, HubSpot, Intercom, Drift, Optimizely, Crazy Egg, Adobe Analytics, Datadog RUM, Yandex Metrica, GTM |

---

## Value Estimates by Tracker (US Adult, Annual)

### Platform Ads (highest per-user value)

| Tracker | Annual Low | Annual High | Per-Visit µ$ | Confidence |
| --- | --- | --- | --- | --- |
| Google Ads / DoubleClick | $420 | $500 | 768 | sourced |
| Meta Pixel | $185 | $250 | 420 | sourced |
| Amazon Ads | $120 | $200 | 320 | sourced |
| TikTok Pixel | $80 | $140 | 220 | sourced |
| LinkedIn Insight Tag | $80 | $120 | 200 | sourced |
| Microsoft Ads (UET) | $20 | $40 | 60 | sourced |
| Pinterest Tag | $28 | $44 | 72 | sourced |
| Reddit Pixel | $25 | $38 | 62 | sourced |
| X (Twitter) Pixel | $20 | $32 | 52 | sourced |
| Snapchat Pixel | $10 | $18 | 28 | sourced |

### Programmatic (fractional CPM-basis)

| Tracker | Annual Low | Annual High | Per-Visit µ$ | Confidence |
| --- | --- | --- | --- | --- |
| Taboola | $2 | $8 | 60 | sourced |
| Criteo | $2 | $8 | 50 | sourced |
| Outbrain | $2 | $6 | 45 | sourced |
| The Trade Desk | $3 | $15 | 18 | sourced |
| Quantcast | $1 | $5 | 30 | sourced |
| PubMatic | $1 | $5 | 10 | sourced |
| Magnite | $1 | $5 | 10 | sourced |
| Index Exchange | $1 | $4 | 8 | estimated |
| OpenX | $1 | $4 | 8 | estimated |
| 33Across | $1 | $3 | 5 | estimated |

### Identity Infrastructure

| Tracker | Annual Low | Annual High | Per-Visit µ$ | Confidence |
| --- | --- | --- | --- | --- |
| 6sense | $1 | $5 | 20 | estimated |
| LiveRamp | $0.50 | $5 | 12 | sourced |
| Lotame | $0.50 | $3 | 8 | estimated |
| Tapad | $0.50 | $3 | 8 | sourced |
| ID5 | $0.10 | $1 | 3 | estimated |

### Operator SaaS (cost to site per user)

| Tracker | Cost Low | Cost High | Per-Visit µ$ |
| --- | --- | --- | --- |
| Adobe Analytics | $0.50 | $5.00 | 30 |
| FullStory | $0.50 | $5.00 | 40 |
| Braze | $0.20 | $2.00 | 15 |
| Hotjar | $0.10 | $1.00 | 8 |
| Datadog RUM | $0.10 | $1.00 | 8 |
| Intercom | $0.05 | $1.00 | 5 |
| HubSpot | $0.01 | $0.50 | 3 |
| Drift | $0.05 | $0.50 | 3 |
| Segment | $0.002 | $0.10 | 0.5 |
| Optimizely | $0.01 | $0.10 | 1 |
| Amplitude | $0.003 | $0.05 | 0.3 |
| Mixpanel | $0.002 | $0.04 | 0.2 |
| Crazy Egg | $0.01 | $0.05 | 0.5 |
| Yandex Metrica | $0 | $0.50 | 2 |
| Microsoft Clarity | $0 | $0.50 | 2 |
| Google Analytics | $0 | $0 | 0 |
| Google Tag Manager | $0 | $0 | 0 |

---

## Rollup Logic

```text
thisVisit_dollars = Σ(tracker.perPersonValue.perVisit.microdollars) / 1,000,000

annualFromThisSite = thisVisit_dollars × estimatedAnnualVisitsToThisSite
                   // default: 12 visits/yr (monthly)

totalAnnual_low  = Σ(tracker.perPersonValue.annual.low_usd)
totalAnnual_high = Σ(tracker.perPersonValue.annual.high_usd)
totalAnnual_mid  = (low + high) / 2
```

**Important:** Annual values are NOT additive in the simple sense — a user doesn't have all 42 trackers on every site they visit. The rollup for a *specific page* uses only the trackers detected there. The `totalAnnual` fields are relevant when showing "your total annual exposure across all sites."

---

## Theoretical Maximums (all 42 trackers active)

| Metric | Value |
| --- | --- |
| Annual value (low) | $1,007 |
| Annual value (high) | $1,479 |
| Per-visit total | 2,615.5 µ$ ($0.002616) |

This aligns well with Proton's finding that a fully-engaged US desktop user is worth $1,605+/year to Google alone, and that total per-person data value including broker markets exceeds $1,000/year.

---

## Data Sources

| Tracker | Source | Data Point |
| --- | --- | --- |
| Google Ads | Proton (2025) | ~$460 US ARPU |
| Google Ads (high) | Mediapost (2026) | $1,605 engaged desktop user |
| Meta Pixel | Statista (Jan 2025) | $49.63 global ARPU 2024 |
| Meta Pixel (US) | Proton (2025) | ~$217 US estimate |
| Pinterest Tag | Statista (Feb 2025) | $9/quarter US/CA Q4 2024 |
| Snapchat Pixel | Statista (Feb 2025) | $3.44/quarter Q4 2024 |
| Reddit Pixel | Reddit Q2 2025 earnings | $7.87/quarter US |
| Amazon Ads | Surff.io (2026) | brand-by-brand analysis |
| TikTok Pixel | Surff.io (2026) | brand-by-brand analysis |
| LinkedIn Insight | Surff.io (2026) | brand-by-brand analysis |
| The Trade Desk | TTD Q4 FY2025 | $2.9B revenue |
| Programmatic CPMs | ZipDo (2026) | US CPMs $2.30–$9.20 |

---

## Future Enhancements

1. **Demographic multipliers** — a 35-44 high-income desktop user is worth 3-5x the average
2. **Category multipliers** — finance/health pages command premium CPMs ($15-50 vs $2-4)
3. **Lifetime value (LTV)** — project 10-year cumulative if tracking starts today
4. **Data broker secondary market** — append dark-web resale value (currently $0.0004–$0.50/record)
5. **Consent signal adjustment** — apply GDPR/CCPA consent state to zero out trackers the user opted out of
