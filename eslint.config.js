import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  ignores: ["build/**", "dist/**", "out/**", ".plasmo/**", "node_modules/**", "*.tsbuildinfo"],
  languageOptions: {
    globals: {
      chrome: "readonly",
      console: "readonly",
      crypto: "readonly",
      document: "readonly",
      HTMLCanvasElement: "readonly",
      location: "readonly",
      window: "readonly"
    }
  },
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
  }
})