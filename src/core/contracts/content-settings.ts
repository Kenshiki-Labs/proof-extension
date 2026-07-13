import * as z from "zod"

import { UserSettingsSchema } from "~core/contracts/settings-schema"
import type { UserSettings } from "~core/domain/types"

// Single source of truth for the settings the MAIN world is allowed to see and
// the data-* flag each is mirrored to on documentElement. Previously three
// files hand-synced this list (the message payload schema, the router
// projection, and the isolated bridge's dataset writer) with no compile-time
// link — forget one and the page silently never sees the flag. Now:
//   - the mask below is `satisfies`-checked against UserSettings, so every
//     content-visible key must be a real setting;
//   - CONTENT_SETTING_DATASET_FLAG is a Record over those exact keys, so a new
//     content setting without a flag is a compile error;
//   - messages.ts, router.ts, and observer.ts all derive from this file.
// Adding a content-visible setting is now two adjacent, compile-enforced edits
// in one place instead of three silent ones across the codebase.
const CONTENT_SETTING_MASK = {
  mitigateCanvas: true,
  gpcEnabled: true
} as const satisfies Partial<Record<keyof UserSettings, true>>

export type ContentScriptSettingKey = keyof typeof CONTENT_SETTING_MASK

// The data-* flag each content setting is mirrored to. Record over the mask
// keys: add a setting to the mask without giving it a flag and this fails to
// compile.
export const CONTENT_SETTING_DATASET_FLAG: Record<ContentScriptSettingKey, string> = {
  mitigateCanvas: "proofExtensionMitigateCanvas",
  gpcEnabled: "proofExtensionGpc"
}

export const ContentScriptSettingsSchema = UserSettingsSchema.pick(CONTENT_SETTING_MASK)
export type ContentScriptSettings = z.infer<typeof ContentScriptSettingsSchema>

// Projects the worker's full settings down to just the content-visible subset
// the page is allowed to receive.
export function projectContentScriptSettings(settings: UserSettings): ContentScriptSettings {
  const projected = {} as Record<ContentScriptSettingKey, boolean>
  for (const key of Object.keys(CONTENT_SETTING_DATASET_FLAG) as ContentScriptSettingKey[]) {
    projected[key] = settings[key]
  }
  return projected as ContentScriptSettings
}
