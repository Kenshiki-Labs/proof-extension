---
title: "V1 Asset Inventory"
description: "Cross-repository inventory of the Kenshiki V1 trust stack and how each asset contributes to the digital phenotyping story arc."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-02
nextReview: 2026-09-30
version: "0.0.1"
status: draft
---

V1 is a complete trust stack. The repositories are not isolated demos; each one owns a layer in the story arc from public explanation, to local observation, to device-side proof, to cloud verification, to identity-backed decisioning.

The intended V1 state is direct: Kenshiki can show why legacy login is insufficient, collect bounded proof from the browser and device, verify that proof at the edge, enrich decisions with telecom and account signals, and hand relying parties a clear assurance result without turning the product into surveillance infrastructure.

## Story Arc

1. **The problem:** authentication proves access to a credential, not continuity of the living session.
2. **The split:** identity legs identify; continuity legs confirm the person and device are still present.
3. **The evidence:** browser, mobile, device-physics, App Attest, passport, telecom, and account signals become bounded proof material.
4. **The control plane:** signed sessions, challenge flows, and completion gates turn evidence into enforceable step-up decisions.
5. **The product:** a deployable web surface, browser observer, mobile SDKs, worker, and API stack make the concept integrable.

## Cross-Repo Inventory

| Repository | V1 asset | Why it exists | Contribution to the story arc |
| --- | --- | --- | --- |
| `proof` | Public proof surface | Shows browser-local presence, passive exposure, behavioral signal capture, and the Pulse challenge narrative in a deployable Vite/React site. | It makes the thesis visible. Users and buyers can see that ordinary web sessions expose continuity signals before they ever integrate an SDK. |
| `proof-extension` | Browser-local observer | Detects first-party fingerprinting, tracker intelligence, blocking outcomes, mitigation status, and source-level remediation from inside the browser. | It proves Kenshiki can separate observation from reassurance: what was seen, what was blocked, what remains exposed, and what must be stopped at the source. |
| `kenshiki-pulse-worker` | Cloudflare verification control plane | Owns bonded sessions, QR and universal-link flows, WebSocket lifecycle, App Attest registration, passport assurance, action commitments, signed webhooks, and fail-closed completion gates. | It turns local evidence into enforceable session decisions. This is where continuity becomes a control plane rather than a slide concept. |
| `vonage-api` | Telecom and account identity rail | Provides an AWS Lambda/FastAPI surface for 2FA, carrier and line-type lookup, identity match, Apple account notifications, trust-score timelines, and OpenAPI contracts. | It anchors continuity in identity context. Phone, carrier, KYC, Apple notification, and trust-score history give the system decision-grade identity legs. |
| `KenshikiDeviceSDK` | Device-physics evidence SDK and sample harness | Collects bounded iOS device-physics evidence, signs canonical evidence envelopes, emits Merkle integrity receipts, supports App Attest challenges, and demonstrates integration flows. | It proves the device can contribute privacy-bounded continuity evidence without sending raw sensor streams or stable hardware identifiers. |
| `KenshikiPulseSDK` | Production Swift Pulse SDK | Gives host apps a stable SwiftPM package to request Pulse checks, collect bounded evidence, sign it on-device, use recurrence tokens, wire App Attest, and submit results for backend decisions. | It is the integration surface. Relying parties get a product-grade SDK for step-up and account-opening checks rather than a research artifact. |

## Layer Responsibilities

### Public Explanation Layer

`proof` carries the public-facing narrative. It demonstrates that the web browser already emits meaningful presence, exposure, and behavioral signals, and it frames why a one-time credential check is not enough for high-risk actions.

In V1, this layer provides the deployable demo site, session-analysis endpoint, telemetry contracts, challenge funnel, and extension distribution path.

### Browser Observation Layer

`proof-extension` carries the browser-local observer. It is intentionally not a generic ad blocker. It answers who is observing the current tab, what they are collecting, whether the extension blocked or mitigated it, and what the source-level remediation path is.

In V1, this layer provides Chrome, Edge, and Firefox packages with normalized evidence, clear status labels, retention controls, and exportable tab reports.

### Device Evidence Layer

`KenshikiDeviceSDK` and `KenshikiPulseSDK` carry bounded mobile proof. They collect derived device-physics evidence, sign canonical envelopes, include privacy-boundary contracts, and expose recurrence as a tenant-scoped rotating signal rather than a cross-tenant identifier.

In V1, this layer provides the difference between “we saw a login” and “the same bounded device context is present again for this high-risk action.”

### Verification Control Plane

`kenshiki-pulse-worker` carries the edge verification plane. It binds browser and device sessions, manages QR and universal-link flows, maintains WebSocket state, verifies App Attest-backed registration, handles passport assurance, records action commitments, and signs outbound webhooks.

In V1, this layer decides whether a protected action can complete. It is the fail-closed bridge between evidence and enforcement.

### Identity Rail

`vonage-api` carries telecom and account identity context. The repo name is historical, but the V1 role is current: Twilio Verify, Twilio Lookup, identity match, Apple Sign in notifications, trust-score timelines, DynamoDB persistence, and an API Gateway/Lambda surface behind a stable domain.

In V1, this layer gives the continuity system identity-grade context so decisions are not based on device evidence alone.

## Intended V1 Outcome

At V1, the estate tells one story:

- `proof` explains the problem and demonstrates the signal surface.
- `proof-extension` shows browser-visible observation honestly and locally.
- `KenshikiDeviceSDK` and `KenshikiPulseSDK` collect privacy-bounded mobile proof.
- `kenshiki-pulse-worker` verifies sessions, gates completions, and emits signed outcomes.
- `vonage-api` supplies telecom, account, and trust-score identity rails.

Together, these assets make digital phenotyping operational: a relying party can ask for proof at the moment of risk, receive bounded evidence, verify continuity, factor identity rails, and complete or stop the action with an auditable reason.

## What This Is Not

- It is not a single monolith.
- It is not a passive tracking system.
- It is not an ad-tech fingerprinting product.
- It is not a promise that browser blocking deletes source-held records.
- It is not a one-time login replacement.

The V1 architecture is a bounded assurance system: visible proof, local evidence collection, signed verification, identity context, and enforceable completion gates.
