#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs"

const checkOnly = process.argv.includes("--check")
const TRACKERS_PATH = "src/core/db/trackers.json"
const VALUATIONS_PATH = "intelligence/normalized/valuations.json"

function stableJson(value) {
  return JSON.stringify(value)
}

const trackers = JSON.parse(readFileSync(TRACKERS_PATH, "utf8"))
const valuations = JSON.parse(readFileSync(VALUATIONS_PATH, "utf8"))

if (valuations.review?.status !== "source_backed") {
  throw new Error(`Refusing to promote valuations with review status ${valuations.review?.status ?? "missing"}`)
}

const marketResearchSource = valuations.sources?.[0]
if (!marketResearchSource || marketResearchSource.family !== "market_research") {
  throw new Error("Refusing to promote valuations without market_research provenance")
}

const valuationByTrackerId = new Map(valuations.records.map((record) => [record.trackerId, record]))
const trackerIds = new Set(trackers.map((tracker) => tracker.id))
const problems = []

for (const record of valuations.records) {
  if (!trackerIds.has(record.trackerId)) problems.push(`valuation for unknown tracker ${record.trackerId}`)
}

const promoted = trackers.map((tracker) => {
  const valuation = valuationByTrackerId.get(tracker.id)
  if (!valuation) {
    problems.push(`missing valuation for tracker ${tracker.id}`)
    return tracker
  }

  const sources = [
    ...tracker.sources.filter((source) => source.family !== "market_research"),
    marketResearchSource
  ]

  const next = {
    ...tracker,
    perPersonValue: valuation.perPersonValue,
    sources
  }

  if (checkOnly) {
    if (stableJson(tracker.perPersonValue) !== stableJson(next.perPersonValue)) problems.push(`stale perPersonValue for ${tracker.id}`)
    const currentMarketSource = tracker.sources.find((source) => source.family === "market_research")
    if (stableJson(currentMarketSource) !== stableJson(marketResearchSource)) problems.push(`stale market_research source for ${tracker.id}`)
  }

  return next
})

if (problems.length > 0) {
  console.error("Intelligence promotion check failed:")
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

if (checkOnly) {
  console.log(`Runtime intelligence promotion fresh (${trackers.length} trackers checked).`)
} else {
  writeFileSync(TRACKERS_PATH, `${JSON.stringify(promoted, null, 2)}\n`)
  console.log(`Promoted valuations into ${TRACKERS_PATH} (${promoted.length} trackers).`)
}