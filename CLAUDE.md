# Working in this repo

This repo is a Plasmo-based browser extension edited by multiple coding
agents (Claude Code and Codex) at different times, sometimes concurrently.
The rules below exist because specific things have already gone wrong.

## Do not run `plasmo build` while `plasmo dev` is running on the same target

Check first: `ps aux | grep "plasmo dev"`. If a dev server is running for
the target you're about to build (e.g. `--target=chrome-mv3`), a concurrent
`plasmo build --target=chrome-mv3` will corrupt the output — the build
directory ends up nested (`build/chrome-mv3-prod/chrome-mv3/manifest.json`
instead of `build/chrome-mv3-prod/manifest.json`), and Chrome's "Load
unpacked" fails with "Manifest file is missing or unreadable." Both
processes share Plasmo's `.plasmo` staging state keyed by target name, and
racing them corrupts it. This is reproducible, not a fluke — it happened
repeatedly in one session until the dev server was stopped first.

If you need a one-off production build, stop the dev server first, build,
then let the user restart dev if they want it. Don't guess whether a dev
server is running — check.

## Do not casually `rm -rf .plasmo build`

If a dev server is live, deleting these mid-session pulls the rug out from
under it and can itself produce a corrupted or half-written output
directory the next time it (or you) writes to it. Only wipe these when
nothing is actively watching the project, and rebuild immediately after.

## Never put a non-entrypoint helper module directly under `src/contents/`

Plasmo auto-registers **every file** directly inside `src/contents/` as its
own content-script entrypoint — it doesn't matter whether the file exports
a `PlasmoCSConfig` or is meant to be imported by another content script.
`src/contents/native-stealth.ts` was a shared helper (`makeLookNative()`)
imported by `page-observer.ts`, but because it lived in `src/contents/`,
Plasmo registered it as a second, dead, standalone content script. Shared
helpers belong in `src/lib/` (or `src/core/`), imported via the `~lib/*` /
`~core/*` path aliases — never in `src/contents/` unless the file itself is
meant to run standalone as a content script.

## Verification checklist before telling the user a build is ready

1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm run test`
4. `npm run build:chrome` (or the target in question)
5. Confirm `manifest.json` exists at the **root** of `build/<target>-prod/`,
   not nested one level deeper. `test -f build/chrome-mv3-prod/manifest.json`
   — if this fails, something is wrong before you tell the user to reload.
6. Repeat for `build:firefox` and `build:edge` if the change touches
   `src/background.ts`, `src/core/db/dnr.ts`, or anything cross-browser —
   Chromium-only APIs (`chrome.declarativeNetRequest`, etc.) must be guarded
   with `typeof chrome !== "undefined"` checks, not assumed to exist, since
   Firefox MV2 doesn't have them. A past regression crashed the entire
   background script on Firefox because a Chromium-only enum was read at
   module scope, outside any guard.

## Multiple agents may be editing this repo at the same time

If a file you just wrote reverts or disappears within seconds, don't assume
you're wrong — check `git status` and re-read the file before re-fighting
it blindly. Another agent (Codex, or a human) may be actively working the
same files. Prefer small, fast write-then-immediately-verify cycles over
large multi-file edits when this is happening, so less work is lost to a
collision.

## Architecture reminders (see `docs/extension.md` for the full spec)

- Product logic belongs in `src/core`. Browser-API differences belong in
  adapters (`src/background.ts`, `src/contents/*`). The popup/options UI
  must never branch on browser family — it reads normalized
  `RuntimeMessage`s only.
- `trackers.json` / `companies.json` / `remediation.json` are the single
  source of truth for tracker intelligence, Zod-validated via
  `validateTrackerDatabase()`. Do not hand-roll ad hoc tracker matching
  logic elsewhere.
- This extension is primarily an **observer**, not a blocker.
  `UserSettings.blockingEnabled` defaults to `false` — nothing should ever
  change that default without an explicit user request to do so.
- UI is Tailwind + `src/components/system/tokens.ts` (TYPE/SPACE/ELEVATION/
  INSET) + small reusable primitives (`Button`, `Section`, `Toggle`) — not
  inline `style={{}}` objects. Config quirk: this repo has
  `"type": "module"` in `package.json`, so Tailwind/PostCSS config must be
  `.postcssrc.json` (plain JSON) and `tailwind.config.mjs` (ESM) — plain
  `.js`/`.cjs` config files fail to load under Parcel's config resolution
  here.
