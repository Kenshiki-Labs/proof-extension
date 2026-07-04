#!/usr/bin/env node
import { spawnSync } from "node:child_process"

const steps = [
  ["vocab:analyze", "Refresh vocabulary frequency report"],
  ["intel:normalize", "Regenerate normalized intelligence artifacts"],
  ["intel:eval", "Regenerate entity-resolution eval artifacts"],
  ["intel:promote", "Promote normalized valuations into the runtime tracker DB"],
  ["db:baseline", "Refresh generated tracker DB baseline"],
  ["qa", "Run strict QA gate"]
]

for (const [script, label] of steps) {
  console.log(`\n==> ${label}`)
  const result = spawnSync("pnpm", [script], {
    shell: process.platform === "win32",
    stdio: "inherit"
  })

  if (result.error) {
    console.error(`\nFailed to run pnpm ${script}: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(`\nStopped after failed step: pnpm ${script}`)
    process.exit(result.status ?? 1)
  }
}

console.log("\nRefresh and QA complete.")