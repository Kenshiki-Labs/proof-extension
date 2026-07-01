# Proof Extension

Proof Extension is a browser-local observer panel for tracker detection, mitigation status, and source-level remediation routing.

The extension is intentionally not a generic privacy blocker. It is designed to answer four questions for the active tab:

1. Who is observing this page right now?
2. What are they collecting?
3. Did the extension block it, partially mitigate it, or fail to stop it?
4. What is the path to stop collection or delete already-held records at the source?

## Status

This repository is an early Plasmo/TypeScript scaffold. The current code establishes the shared core types, tab summary store, browser entrypoints, seed tracker database files, and project documentation needed to build toward the full specification.

## Principles

- The browser is not the root of trust.
- First-party fingerprinting counts as observation even when no third-party host is involved.
- Blocking does not equal deletion.
- Outcomes must distinguish `blocked`, `active`, `mitigated`, and `cannot_block`.
- Browsing telemetry must not be uploaded to a vendor backend in v1.

## Development

Install dependencies:

```bash
pnpm install
```

Run the extension in development:

```bash
pnpm dev
```

Build browser targets:

```bash
pnpm build:chrome
pnpm build:firefox
pnpm build:edge
```

Run checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Repository Layout

- `src/core`: shared product logic, types, status resolution, state, and DB seed files.
- `src/background.ts`: browser runtime entrypoint.
- `src/content.ts` and `src/contents`: content-script entrypoints and observation hooks.
- `src/popup.tsx`: popup UI entrypoint.
- `src/options.tsx`: options page entrypoint.
- `docs`: architecture, threat model, and permissions notes.

## License

MIT
