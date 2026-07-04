# TODO — next work sessions (prompt)

You are working in `proof-extension` (Pulse Observer, Plasmo browser
extension). Read `CLAUDE.md` first — it is binding — then
`docs/observer-spec.md` (the `Current Implementation Baseline` section is
accurate as of 2026-07-04). Work the tasks below **in order**, one task per
commit (or small commit series), and finish each completely before starting
the next: code + tests + docs updated + gates green. No half-finished work.

Standing rules for every task:

- Run the full gate before claiming done: `pnpm qa`, and when the change
  touches content scripts, background, or DNR: `pnpm test:browser`,
  `pnpm test:e2e` (needs `xvfb-run -a` in headless environments), and
  `pnpm build:firefox` + `pnpm build:edge`.
- Update the `Current Implementation Baseline` section of
  `docs/observer-spec.md` when a task changes what is true.
- Never fabricate provenance. A `sources` entry with a URL and
  `retrieved_at` date means the page was actually retrieved in this
  session. If you cannot retrieve it, leave `review.status: seed` and say
  so. Model memory is not a source (owner decision, 2026-07-04).
- Regenerate derived artifacts after data changes: `pnpm db:baseline`,
  `pnpm vocab:analyze` (if user-facing strings changed),
  `pnpm intel:normalize` (if intelligence inputs changed).

---

## 1. Source-back the 42 tracker records — REQUIRES WEB ACCESS

Blocked in restricted environments: verify web access first (fetch any
vendor docs page). If blocked, skip to task 2 and tell the owner why.

For each record in `src/core/db/trackers.json` (all 42 are
`review.status: seed`, 0 source-backed):

1. Retrieve vendor documentation / privacy policy / developer docs that
   support the record's identity, ownership (`companyId` join), collection
   (`collects`), and blocking claims (`match.domains`). The license-clean
   source family is `vendor_docs` (see `docs/intelligence-standards.md`;
   Tracker Radar and Ghostery TrackerDB are CC BY-NC-SA — reference only,
   do not vendor without license review).
2. Add a `sources` entry per verified claim group: family `vendor_docs`,
   real URL, real `retrieved_at`, `transform_notes` saying what the source
   supports.
3. Flip `review.status` to `source_backed` only where
   `validateTrackerDatabase` accepts it (it enforces tracker-claim
   provenance); update `review.last_reviewed_at` and `notes`.
4. While there: verify the 11 SDK signatures added 2026-07-04
   (`src/core/signals/sdk-globals.ts` — googletag, _satellite, PWT,
   rubicontag, headertag, ID5, Tynt, _6si, OX, ats, LOTCC) against live
   vendor pages; correct or demote to `probable` with a note if wrong.
5. Also verify each record's `remediation.json` URLs still resolve
   (`future_collection_url`, `deletion_url`); update `last_verified_at`.

Done when: every record either carries retrieved provenance or its
`review.notes` says exactly what could not be verified; `pnpm qa` green.

## 2. Production blocked-state reporting

`chrome.declarativeNetRequest.onRuleMatchedDebug` (src/background.ts) only
fires in unpacked dev builds. In a packed/store build, DNR still blocks but
events never upgrade seen→blocked, so the UI shows "Still exposed" for
blocked trackers. This must land before any public artifact ships.

- Add a `webRequest.onErrorOccurred` listener; treat
  `net::ERR_BLOCKED_BY_CLIENT` for a request whose URL matches an
  *installed* dynamic rule (see `getDynamicBlockRuleMetadata` /
  `buildDynamicBlockRuleSet` in `src/core/db/dnr.ts`) as a deterministic
  block outcome. Record `request_blocked` and supersede the matching
  `request_seen` exactly as the onRuleMatchedDebug path does — factor the
  shared logic, don't duplicate it.
- Keep onRuleMatchedDebug as the richer dev-build signal; guard both paths
  for Firefox (`typeof chrome` checks — a Chromium-only enum at module
  scope once crashed the Firefox background, see CLAUDE.md).
- Only claim `blocked` on the deterministic signal; anything else stays
  seen/active (spec: `declarativeNetRequestFeedback` rules).
- E2E: extend `tests/e2e/tracker-fixture.spec.ts` blocking test to assert
  the blocked state appears **without** relying on onRuleMatchedDebug if
  feasible (launch flag or assert the onErrorOccurred path fired).

Done when: a packed build reports blocked states; E2E proves it; spec
baseline updated.

## 3. Complete the persistence family

The JS-visible subset shipped 2026-07-04 (`src/core/signals/persistence.ts`,
`src/core/content/persistence-hooks.ts`). Three families remain and are
deliberately absent from the runtime schema until an emitter exists:

- `cookie_observed` via the optional `cookies` permission: browser-level
  cookie metadata incl. `HttpOnly` (names/expiry/SameSite/Secure only —
  never values). Request the permission at moment of need, never at
  install; UI must label the no-permission state as lower visibility.
- `cache_validator_seen`: ETag / If-None-Match / Last-Modified as
  header-NAME evidence from webRequest response observers, never values.
- `storage_respawn_suspected`: per-install keyed digest (secret in
  extension storage, cleared by CLEAR_LOCAL_DATA, never exported);
  confidence `probable` only on recurrence per the spec's rules.

Follow the existing trust model: main world reports bare metadata,
privileged side re-redacts and rebuilds evidence (extend
`normalizePersistenceEvent`). Add event types to `types.ts` + Zod schema
only together with their emitter. Unit + E2E tests like the existing
persistence fixture (assert secret values never stored).

## 4. Phase 1 launch mechanics

- Versioned Chrome MV3 artifact + `/observe` download page (page lives in
  the Proof site repo, not here — coordinate).
- Reconcile `docs/permissions.md` against the spec's store-review posture
  section (why `<all_urls>`, why webRequest is observe-only, what is
  stored locally, what is never uploaded).
- Confirm popup failure-mode states against the spec list (restricted
  pages, missing permission, stale DB, suspended worker).

## 5. Phase 2 (after 1–4)

- Opt-in canvas/audio/WebGL mitigation hooks — the `mitigateCanvas/Audio/
  Webgl` settings exist and sync to the page
  (`data-proof-extension-mitigate-canvas`), but no hook reads them yet.
  Hooks must be off by default, only mitigate when the setting is on, and
  be dropped if they break the fixture set. `content_mitigatable` events
  become `mitigated` only when a hook actually changed/constrained the
  API result.
- Firefox MV3 migration evaluation + parity pass (same normalized
  event/status model across browsers).
- The 67 quarantined research-entity conflicts — only when research
  entities get promoted; do not import quarantine data into runtime code.

---

Session log (update when a task completes):

- [x] 2026-07-04 — spec reconciled with 0.3.x; SDK-detection forgery gap
      closed; blockability reclassification + disjoint domains;
      persistence observers (JS-visible); suffix-index matching; coalesced
      writes; 40/42 SDK signatures; 10/10 entity conflicts adjudicated
      (branch `claude/observer-spec-review-uv3nz9`).
- [ ] Task 1 — source-backing (needs web access)
- [ ] Task 2 — production blocked-state reporting
- [ ] Task 3 — persistence completion
- [ ] Task 4 — launch mechanics
- [ ] Task 5 — Phase 2
