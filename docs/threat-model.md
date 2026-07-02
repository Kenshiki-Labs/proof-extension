---
title: "Threat Model"
description: "What Pulse Observer can and cannot detect or prevent, and where its visibility ends."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-01
nextReview: 2026-09-29
version: "0.0.1"
status: draft
---

The extension detects and reports browser-visible observation. It cannot prevent destination servers from seeing IP addresses, TLS fingerprints, or request headers emitted before extension intervention.
