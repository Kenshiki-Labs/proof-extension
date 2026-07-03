# Intelligence Quarantine

This directory contains generated intelligence artifacts that are useful for audit, evaluation, or future review, but are not part of the extension-purpose SSOT.

The extension-purpose SSOT is `intelligence/normalized/entities.json`. It keeps only entities reachable from runtime tracker/company records. Broker-only and defense-only entities stay here until a reviewed promotion links them to an observed runtime company or tracker.

Rules:

- Do not import quarantine files from extension runtime code.
- Do not use quarantine records for popup/report claims.
- Promote only through reviewed artifacts under `src/core/db/*`.
- Keep generated quarantine files deterministic and pinned by the snapshot manifest.
