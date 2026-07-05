import { vi } from "vitest"

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>()

  get length() {
    return this.items.size
  }

  clear() {
    this.items.clear()
  }

  getItem(key: string) {
    return this.items.get(String(key)) ?? null
  }

  key(index: number) {
    return [...this.items.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.items.delete(String(key))
  }

  setItem(key: string, value: string) {
    this.items.set(String(key), String(value))
  }
}

if (typeof window !== "undefined" && !window.localStorage) {
  vi.stubGlobal("Storage", MemoryStorage)
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: new MemoryStorage()
  })
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: new MemoryStorage()
  })
}

vi.stubGlobal("chrome", {
  declarativeNetRequest: {
    ResourceType: {
      MAIN_FRAME: "main_frame",
      SUB_FRAME: "sub_frame",
      STYLESHEET: "stylesheet",
      SCRIPT: "script",
      IMAGE: "image",
      FONT: "font",
      OBJECT: "object",
      XMLHTTPREQUEST: "xmlhttprequest",
      PING: "ping",
      CSP_REPORT: "csp_report",
      MEDIA: "media",
      WEBSOCKET: "websocket",
      OTHER: "other"
    },
    RuleActionType: {
      BLOCK: "block"
    },
    onRuleMatchedDebug: {
      addListener: vi.fn()
    },
    getDynamicRules: vi.fn().mockResolvedValue([]),
    updateDynamicRules: vi.fn().mockResolvedValue(undefined)
  },
  runtime: {
    onMessage: {
      addListener: vi.fn()
    },
    sendMessage: vi.fn()
  },
  tabs: {
    query: vi.fn()
  },
  webRequest: {
    onBeforeSendHeaders: {
      addListener: vi.fn()
    },
    onBeforeRequest: {
      addListener: vi.fn()
    },
    onHeadersReceived: {
      addListener: vi.fn()
    }
  }
})
