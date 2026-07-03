import fs from "node:fs/promises"

const trackersPath = new URL("../src/core/db/trackers.json", import.meta.url)

const source = {
  family: "manual_seed",
  name: "Proof Extension seed tracker database",
  version: "0.0.1",
  retrieved_at: "2026-07-02",
  license: "MIT",
  transform_notes:
    "Hand-authored seed record based on common public tracker domains and product behavior; not imported from a third-party list."
}

const review = {
  status: "seed",
  last_reviewed_at: "2026-07-02",
  reviewer: "Kenshiki",
  notes: "Seed record pending source-backed Tracker Radar/EasyPrivacy import review."
}

const trackers = JSON.parse(await fs.readFile(trackersPath, "utf8"))
const migrated = trackers.map((tracker) => ({
  ...tracker,
  sources: tracker.sources ?? [source],
  review: tracker.review ?? review
}))

await fs.writeFile(trackersPath, `${JSON.stringify(migrated, null, 2)}\n`)