---
title: "Architecture"
description: "How Pulse Observer's shared core, browser adapters, and Plasmo entrypoints fit together."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-01
nextReview: 2026-09-29
version: "0.0.1"
status: draft
---

Pulse Observer uses a shared core with thin browser-specific adapters. Product logic belongs in `src/core`; Plasmo entrypoints wire browser runtime events into normalized core messages.

Tracker intelligence must follow `docs/intelligence-standards.md`: DuckDuckGo Tracker Radar is the entity metadata benchmark, while EasyPrivacy/EasyList policy is the privacy-blocking benchmark.
