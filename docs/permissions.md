---
title: "Permissions"
description: "The browser permissions Pulse Observer requests and why each one is needed."
owner: Kenshiki
section: docs
lastReviewed: 2026-07-01
nextReview: 2026-09-29
version: "0.0.1"
status: draft
---

- `activeTab`: read the active tab context for popup summaries.
- `declarativeNetRequest`: block Chromium MV3 network requests where rules apply.
- `scripting`: install content hooks where static content scripts are insufficient.
- `storage`: store settings, DB version, compact summaries, and reminders.
- `<all_urls>` host permissions: observe request and content behavior across sites; this should be narrowed if the implementation can preserve function with optional permissions.
