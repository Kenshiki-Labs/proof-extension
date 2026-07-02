---
title: "QA Stack"
description: "The layered QA gates — schema validation, static analysis, unit, browser, and E2E tests — that must pass before release."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-01
nextReview: 2026-09-29
version: "0.0.1"
status: draft
---

Proof Extension uses layered QA so bad data, unsafe contracts, broken adapters, and browser behavior regressions fail before release.

## Layers

- Schema and contracts: Zod validates tracker DB files, remediation records, settings, observer events, site summaries, and runtime messages.
- Static analysis: TypeScript strict mode plus ESLint guard authored source and adapter boundaries.
- Unit tests: Vitest covers status resolution, schema validation, DB referential integrity, and summary storage behavior.
- Browser/component tests: Vitest Browser Mode with Playwright is available for DOM-realistic tests.
- Real extension E2E: Playwright is configured for Chromium extension behavior against built artifacts.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:browser
pnpm build:chrome
pnpm test:e2e
pnpm qa
```

## Production Gate

Before a release candidate, run:

```bash
pnpm qa
pnpm build:firefox
pnpm build:edge
```

The baseline CI gate runs `pnpm qa`, which covers linting, strict type checking, coverage-enforced unit tests, and the Chrome MV3 build.
