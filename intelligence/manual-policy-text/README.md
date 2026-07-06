# Manual policy-text drop

For vendors whose policy pages are unreachable by automated fetch (hard
Cloudflare challenges, e.g. magnite, 33across): paste the real policy text here
and let `scripts/source-back-from-text.mjs` verify and source-back it. No
browser, no bot-wall fighting.

## How

1. Open the vendor's privacy policy in your **normal** browser.
2. Create a file named after the tracker id, e.g. `magnite.txt`, `33across.txt`.
3. **Line 1 = the policy URL** you copied from. **Lines 2+ = the pasted policy text.**
4. Run: `node scripts/source-back-from-text.mjs` (dry run), then `--write`.

The `.txt` files are gitignored — they are inputs, not committed. The script
writes only the URL, a real `retrieved_at`, and a short excerpt into
`trackers.json` (referenced, not reproduced). It flips a record to
`source_backed` only when the pasted text carries policy signals and the
vendor's own identity, so a wrong/empty paste fails safely.
