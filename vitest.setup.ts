import { vi } from "vitest"

vi.stubGlobal("chrome", {
  runtime: {
    onMessage: {
      addListener: vi.fn()
    },
    sendMessage: vi.fn()
  },
  tabs: {
    query: vi.fn()
  }
})