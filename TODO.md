# TODO

## 0.7 — Broaden canvas mitigation coverage (OffscreenCanvas + WebGL)

**Status:** planned (candidate for the next release after 0.6.0).

### Context

0.6.0 ships canvas mitigation that is **2D-only**: it hooks
`HTMLCanvasElement.toDataURL` / `toBlob` and `CanvasRenderingContext2D.getImageData`
(see `src/core/content/canvas-hooks.ts`). The options copy in `src/options.tsx`
honestly names the gap ("Does not cover OffscreenCanvas or WebGL readbacks"), so
this work is what lets us tighten that claim.

### Goal

Extend the per-session noise mitigation (and the `canvas_read` observation) to
the readback paths a fingerprinter can use to sidestep the 2D hooks.

### Tasks

- [ ] Hook `OffscreenCanvas.convertToBlob` and
      `OffscreenCanvasRenderingContext2D.getImageData` (main-thread OffscreenCanvas).
- [ ] Hook `WebGLRenderingContext.readPixels` and `WebGL2RenderingContext.readPixels`.
- [ ] Evaluate `createImageBitmap` as an additional readback surface.
- [ ] Thread the honesty gate through every new hook exactly like the 2D path:
      report `mitigated: true` **only** when noise actually changed a pixel
      (`applyCanvasNoise` returns a touched-count — do not discard it).
- [ ] Extend the background normalizer (`src/core/signals/canvas-read.ts`) so the
      new readbacks record as `canvas_read`, and the "mitigated" status stays
      settings-gated (never trust a page-supplied claim).
- [ ] Update `src/options.tsx`: soften/replace the "Does not cover OffscreenCanvas
      or WebGL readbacks" line to describe the **remaining** gap accurately (see
      the hard limit below) — never claim full coverage.
- [ ] Extend `tests/e2e/privacy-controls.spec.ts` to drive OffscreenCanvas and
      WebGL readbacks and assert noise + honest `mitigated` status.

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
