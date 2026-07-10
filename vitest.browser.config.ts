import { playwright } from "@vitest/browser-playwright"
import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // Mirror the path aliases from vitest.config.ts so browser tests resolve ~core/~contents
  // imports the same way node tests do (otherwise e.g. ~core/atlas/types fails to resolve).
  resolve: {
    alias: {
      "~core": path.resolve(__dirname, "src/core"),
      "~contents": path.resolve(__dirname, "src/contents")
    }
  },
  test: {
    browser: {
      enabled: true,
      instances: [{ browser: "chromium" }],
      provider: playwright()
    },
    include: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"]
  }
})
