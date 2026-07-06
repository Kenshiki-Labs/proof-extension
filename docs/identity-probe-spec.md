---
title: Identity Probe Spec — the local mirror
description: Local-only, egress-forbidden probe that reads the same identifying surfaces any in-page script can read, to show the user what every third party in the render already took.
owner: stephen
status: draft
version: 0.1.0
lastReviewed: 2026-07-05
nextReview: 2026-08-05
---

# Identity Probe Spec

## Purpose

Every third-party script that executes in a page render can read the browser's identifying surface — GPU, screen, timezone, fonts, device class — with **zero permission prompt and zero mention in any consent flow**. The cookie banner governs cookies; it never governs this. The Identity Probe reads that same surface **once, locally, and shows it to the user** — a mirror of what the page's own trackers already have, not a new collection.

This is the extension-local counterpart to the proof app's live session read (`src/lib/siteTelemetry.js`, `serverRequestProfile.js`). Same reads, same honesty model, same entropy math (`entropyModel.js`) — but bound by a stricter rule the site does not need: **the probe never transmits.**

## Non-negotiable posture

1. **Egress-forbidden by construction.** The probe's values never leave the device. The extension's only network activity remains DNR blocking and `webRequest` observation; the probe adds no `fetch`, no beacon, no geo lookup, no tile request. A probe result that reaches any network is a P0 defect, not a bug.
2. **Mirror, not collector.** The probe reads only what an ordinary in-page script could already read at that moment. It invents nothing and reaches for nothing a tracker couldn't. Its output is addressed to the user about their own browser.
3. **Runs once, on the existing exposure scan.** No new lifecycle — it rides the popup-triggered active-tab scan (`source: "extension-scan"`), so it does not increase the extension's footprint on the page beyond what already runs.
4. **Masking is a finding, not a failure.** When a hardened browser refuses or randomizes a surface (SwiftShader GPU, randomized canvas, absent `deviceMemory`), that refusal is recorded as evidence — "your browser defends this" — never silently dropped.

## Architecture

Reuses the existing main-world bridge (`MAIN_WORLD_SCRIPT_ID`) and the page-channel forgery guard (`src/core/domain/message-guards.ts`).

```
main-world probe (reads APIs)
   → postMessage to isolated content script
   → OBSERVED_EVENT to background (message-guards reject forged network-family claims)
   → normalized into exposure-scan events, stored in the per-tab summary
   → rendered by the report's identity surfaces; never serialized to any request
```

The main world is required: `WEBGL_debug_renderer_info`, canvas, and audio reads must run in the page's own JS context. The isolated content script and background never trust raw page-channel values for network-family evidence (existing guard); the probe's events are `extension-scan` source and first-party, so they cannot inflate watcher/company counts.

## The reads — tiered by (unblockable × unconsented × alarm)

Ordered by the product's own criterion: what arrives with the least defense and the least disclosure. Bits are per `entropyModel.js` — **measured** values from EFF Panopticlick (2010) are cited; everything else is this project's conservative **estimate**, marked as such in the UI. Bits are additive and treated as independent (overstates precision; correlated surfaces noted).

### Tier A — passive reads. Unblockable without breaking the page. Never consented.

| Surface | API | Example value | Bits | Blockability | Masking signal |
|---|---|---|---|---|---|
| Timezone | `Intl.DateTimeFormat().resolvedOptions().timeZone` | `America/Denver` | 3.04 (measured) | none — needed for correct rendering | UTC-only → VPN/hardened |
| Screen + DPR | `screen.width/height`, `screen.colorDepth`, `devicePixelRatio` | `1512×982 @2x, 30-bit` | 4.83 (measured) | none | rounded/spoofed values |
| Platform + language | `navigator.platform`, `navigator.languages` | `macOS · en-US` | 2.10 (est.) | none | single generic locale |
| CPU cores | `navigator.hardwareConcurrency` | `8` | 2.0 (est.) | none | absent → masked |
| Device memory | `navigator.deviceMemory` | `16` (GB tier) | 1.5 (est.) | none (Chromium only) | absent (Firefox/Safari) → finding, not gap |
| User-Agent / UA-CH | `navigator.userAgentData`, `navigator.userAgent` | `macOS 14.5 · Chrome 126` | ~10 (est., high-entropy) | none — sent on every request too | reduced-UA → partial mask |

**Locality note.** Timezone is the *only* on-device locality signal (region, not a pin). IP→city requires egress and is therefore **out of scope for the probe** — the extension states the observed fact ("your IP left on N requests; any of these servers can map it") from the request stream it already sees, and hands the actual pin to the proof app. See "The map" below.

### Tier B — active reads. Zero permission prompt, unconsented — but defended by hardened browsers.

| Surface | API | Example value | Bits | Blockability | Masking signal |
|---|---|---|---|---|---|
| **GPU renderer** | WebGL `WEBGL_debug_renderer_info` → `UNMASKED_RENDERER_WEBGL` | `ANGLE (Apple, Apple M2 Pro)` | 7.0 (est.) | Chrome Privacy Budget may mask | `SwiftShader`/generic/empty → masked = finding |
| Canvas hash | 2D render → `toDataURL` → digest | `a3f9…c2` | 5.0 (est.) | Brave/Tor/RFP randomize | differs across calls → defended = finding |
| Audio fingerprint | `OfflineAudioContext` DSP readout | stable float sig | 3.0 (est.) | RFP randomizes | differs across calls → defended |
| Installed fonts | measurement (fallback-width probe of a font list) | `34 of 120 present` | 6.0 (est.) | RFP limits to system set | system-only set → defended |

**The GPU read is the headline** — it does not feel like a fingerprint; it names the user's hardware ("Apple M2 Pro"). Highest alarm-per-bit. Port it first.

### Explicitly NOT probed (posture)

- **WebRTC public IP via STUN** — needs a STUN server = egress. The extension *observes* a page doing this (`webrtc_probe` eventType, passive) but never runs its own.
- **IP geolocation** — egress. Stated as observed fact, pinned only by the proof handoff.
- **Battery, Bluetooth, USB, sensors** — either permission-gated (so consent exists) or removed; out of the "unconsented + unblockable" scope this spec targets.

## Honesty rules (inherits observer-spec)

- Measured vs estimated is shown per surface, never blurred. The additive-independence caveat is stated wherever a cumulative bit total appears.
- A masked/refused surface is recorded as its own evidence line ("your browser hides this — most don't"), which is a *positive* finding about the user's defenses, not a missing value.
- The probe result is labeled as capability — "what any script in this render can read" — not an accusation that a specific tracker read it. Whether a named tracker read it is a separate, network-observed claim.
- Bit counts and candidate-pool figures use the shared `entropyModel` and carry its disclaimer verbatim. The two products must not drift; the port is kept in lockstep (a test asserts the surface list and bit values match the proof app's model).

## Event shape

Probe reads land as `extension-scan` events, `firstParty: true`, `eventType: "browser_surface"` (existing), with:

- `details.apiGroup`: `"identity_passive"` | `"identity_probe"` (Tier A vs B, so the UI can separate "no consent, no defense" from "no consent, some browsers defend").
- `details.surface`: `"gpu"` | `"timezone"` | `"screen"` | `"fonts"` | …
- `details.masked`: boolean — true when the surface refused/randomized.
- `evidenceTier`: `"observed"`.
- `evidence[0]`: the read itself, e.g. `"WebGL named your GPU: ANGLE (Apple, Apple M2 Pro). No permission was requested."` Values are the user's own; they render only to the user and are never included in `buildCopyPayload` network fields.

## Surfaces it feeds

1. **Popup mirror** (surface-contract §Popup) — the actual values, before any number, then the narrowing sentence.
2. **Report narrowing chain** — the `entropyModel` funnel, each row a real read, masked rows shown as "defended."
3. **Consent gap** — the Tier-A set is the right column ("taken regardless of your answer"); the TCF banner is the left.
4. **Three-tier watcher card** — the probe defines the "had access to" floor every in-render script shares.

## The map

The pin requires egress (IP→geo + tile fetch, token, coordinates to Mapbox) and therefore **must not run silently in the extension** — doing so is the exact behavior the product condemns. Resolution:

- **Default:** no map. State the unblockable fact from the observed request stream: *"Your IP left on N of these requests. Any of those servers can place you on a map."*
- **Pin:** a `See what they see →` deep-link to the proof app, which has a server and openly performs the geolocation as its demonstration. The extension never geolocates.
- **Optional disclosed one-shot** (build only if the in-panel pin is wanted): an explicit button stating "this sends this tab's IP to Mapbox," gated, never default — the one time something asks first, by deliberate contrast.

## Test plan

- `identity-probe.test.ts` — each read parses into the event shape; masked surfaces set `details.masked` and never throw; no read path constructs a URL or calls `fetch`/`sendBeacon` (static assertion + runtime spy).
- Entropy lockstep — the probed surface list and per-surface bit values equal the proof app's `entropyModel` definitions (imported fixture), so the two products cannot silently diverge.
- Egress guard (e2e) — with the probe active on a fixture page, assert zero outbound requests originate from the extension carrying any probed value.
- Posture — probe values never appear in `buildCopyPayload`'s transmittable fields; they appear only in the user-facing render.
