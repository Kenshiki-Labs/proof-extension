# TODO

## 0.7 — Canvas coverage + observation features (WebRTC, device fields, digest)

**Status:** SHIPPED — committed on branch `feat/0.7-observation-package`
(7a0f664) and **uploaded to the Chrome Web Store 2026-07-15** (review pending).
Full QA green: tsc, lint, prettier, design/vocab gates, 535 unit tests, 22 e2e
tests, and chrome/firefox/edge builds/zips at 0.7.0. **No new permissions** —
CWS data-disclosure answers unchanged from 0.6.

The 0.7 package bundles four additive pieces:

1. **Broadened canvas mitigation** — main-thread OffscreenCanvas
   (`convertToBlob`, `getImageData`) and WebGL `readPixels` (RGBA/UNSIGNED_BYTE
   only) now noise through the same honesty gate as the 2D path. Residual gaps
   (Web Worker realm, non-RGBA/float WebGL reads, WebGL renderer identity) are
   stated in the options copy. `createImageBitmap` evaluated and deliberately
   skipped (source→bitmap, not a script-visible readback).
2. **WebRTC IP-leak observation** (observe-only) — a live hook on the dormant
   `webrtc_probe` type: constructing an `RTCPeerConnection` is named as a
   capability that can reveal public + local-network IPs. Never reads or stores
   an address. `src/core/content/webrtc-hooks.ts` + `signals/webrtc-probe.ts`.
3. **Passive device-field observation** (observe-only) — new `device_field_read`
   type; a getter hook reports when a page actually READS cores, memory,
   languages, screen size, or time zone (distinct from the extension-scan's
   "could read"). Field name only, never the value.
   `src/core/content/device-field-hooks.ts` + `signals/device-field.ts`.
4. **Per-site fingerprint digest** — the AuditBrief now carries a plain-language
   takeaway naming the first-party fingerprint surfaces the page read itself
   (canvas/WebGL/audio/fonts/WebRTC/device fields), separate from third-party
   contact. Pure, tested: `src/core/report/fingerprint-digest.ts`.

Refactor along the way: the observed-event normalizer chain was extracted from
`background.ts` into `signals/normalize-observed-event.ts` (background.ts fell
from 459 → 421 lines and graduated off the no-god-files shrink-only baseline).

### Context

0.6.0 ships canvas mitigation that is **2D-only**: it hooks
`HTMLCanvasElement.toDataURL` / `toBlob` and `CanvasRenderingContext2D.getImageData`
(see `src/core/content/canvas-hooks.ts`). The options copy in `src/options.tsx`
honestly names the gap ("Does not cover OffscreenCanvas or WebGL readbacks"), so
this work is what lets us tighten that claim.

### Goal

Extend the per-session noise mitigation (and the `canvas_read` observation) to
the readback paths a fingerprinter can use to sidestep the 2D hooks.

### Tasks — all complete (commit 2c95624)

- [x] Hook `OffscreenCanvas.convertToBlob` and
      `OffscreenCanvasRenderingContext2D.getImageData` — `installOffscreenCanvasReadHooks`
      in `src/core/content/canvas-hooks.ts` (noised copy via injected `createOffscreen`,
      since OffscreenCanvas has no `ownerDocument`).
- [x] Hook `WebGLRenderingContext.readPixels` and `WebGL2RenderingContext.readPixels` —
      `installWebglReadHooks`; noise applied to the out-param buffer after the real read.
- [x] Evaluate `createImageBitmap` — evaluated and **deliberately skipped**: it is a
      source→bitmap op, not a script-visible pixel readback.
- [x] Thread the honesty gate through every new hook — each reports `mitigated`
      only when `applyCanvasNoise` returns `touched > 0`; WebGL additionally noises
      **only** RGBA/UNSIGNED_BYTE byte buffers (RGB/float/PBO pass through unmitigated).
- [x] Extend the background normalizer (`src/core/signals/canvas-read.ts`) — added
      `convertToBlob` and `readPixels` to `CANVAS_READ_APIS`; `mitigated` stays
      settings-gated via `normalizeCanvasReadEvent`.
- [x] Update `src/options.tsx` — replaced the "Does not cover OffscreenCanvas or WebGL"
      line; now enumerates covered surfaces and states the residual worker/non-RGBA gaps.
- [x] Extend `tests/e2e/privacy-controls.spec.ts` — new test drives main-thread
      OffscreenCanvas + WebGL `readPixels` and asserts noise + honest `mitigated` status.

### Hard limitation — plan the copy for this UP FRONT

**`OffscreenCanvas` created inside a Web Worker is unreachable from a content
script.** Content scripts (including our MAIN-world `page-observer.ts`) do not
run in worker realms, so we cannot hook canvas APIs used inside a `Worker`.
Even after this work, a residual **"canvas reads inside a Web Worker are not
covered"** caveat remains. Do not write copy that implies total coverage; state
the worker boundary the same way the "What we can't protect" section states the
IP / TLS-fingerprint boundary.

### Notes

- Same tradeoff as the 2D path: randomization is itself detectable as
  randomization. Keep the "different, not invisible" framing.
- No new permissions expected → CWS data-disclosure answers unchanged.
- Ship as **0.7.0** (or fold into a 0.6.1 if bundling small fixes). Remember CWS
  requires the manifest `version` to be strictly greater than the published one.

_See memory: `pulse-observer-cws-submission` for the 0.6.0 submission baseline._
