import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      "~core": path.resolve(__dirname, "src/core"),
      "~contents": path.resolve(__dirname, "src/contents")
    }
  },
  test: {
    coverage: {
      exclude: ["build/**", ".plasmo/**", "node_modules/**", "src/**/*.test.ts", "src/**/*.test.tsx"],
      include: ["src/core/**/*.ts"],
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    },
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "https://example.test/"
      }
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"]
  }
})
