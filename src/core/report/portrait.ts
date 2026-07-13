import type { NarrowingStep } from "~core/domain/identity-entropy"

// The popup's narrowing mirror speaks the product thesis — "the internet met
// your digital self before you did" — so the raw surface reads are rendered
// as an introduction to a person, not an inventory. This module is pure
// copy-mapping: every phrase derives from a fact already on the narrowing
// model, and anything it cannot phrase honestly falls back to the raw
// detail rather than inventing a nicer claim. The raw reads themselves stay
// available verbatim behind the panel's disclosure.

// IANA zone → colloquial zone name. Zone-level on purpose: the honesty rule
// on this surface is that a timezone must NEVER be rendered as a city
// ("America/Los_Angeles" is all of US Pacific). Only unambiguous zone-wide
// names belong here; anything unmapped keeps its IANA id.
const ZONE_NAMES: Record<string, string> = {
  "America/Los_Angeles": "US Pacific time",
  "America/Denver": "US Mountain time",
  "America/Phoenix": "US Mountain time",
  "America/Chicago": "US Central time",
  "America/New_York": "US Eastern time",
  "America/Anchorage": "Alaska time",
  "Pacific/Honolulu": "Hawaii time"
}

const PLATFORM_NAMES: Record<string, string> = {
  MacIntel: "a Mac",
  Win32: "a Windows PC",
  Win64: "a Windows PC",
  iPhone: "an iPhone",
  iPad: "an iPad"
}

function platformName(platform: string): string {
  const mapped = PLATFORM_NAMES[platform]
  if (mapped) return mapped
  if (/linux/i.test(platform)) return "a Linux machine"
  if (/android/i.test(platform)) return "an Android device"
  return `a ${platform} device`
}

function languageName(tag: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(tag)
    if (name && name !== tag) return name
  } catch {
    /* fall through to the raw tag */
  }
  return tag
}

function timezoneTrait(detail: string): string {
  const zone = ZONE_NAMES[detail]
  return zone ? `living on ${zone}` : `living in the ${detail} time zone`
}

function screenTrait(detail: string): string {
  const match = /^(\d+x\d+) @([\d.]+)x$/.exec(detail)
  if (!match) return `looking at a ${detail} screen`
  const [, resolution, ratio] = match
  return ratio === "1" ? `looking at a ${resolution} screen` : `looking at a ${resolution} screen at ${ratio}× density`
}

function platformLanguageTrait(detail: string): string {
  // buildNarrowingModel composes this detail as "platform · language" (either
  // part may be absent). Re-split what the model joined.
  const parts = detail.split(" · ").map((part) => part.trim()).filter(Boolean)
  const platform = parts.find((part) => !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(part))
  const language = parts.find((part) => /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(part))
  if (platform && language) return `using ${platformName(platform)} in ${languageName(language)}`
  if (platform) return `using ${platformName(platform)}`
  if (language) return `browsing in ${languageName(language)}`
  return `using ${detail}`
}

function gpuTrait(detail: string): string {
  if (/apple/i.test(detail)) return "drawing with an Apple GPU"
  if (/nvidia|geforce|rtx|gtx/i.test(detail)) return "drawing with an NVIDIA GPU"
  if (/amd|radeon/i.test(detail)) return "drawing with an AMD GPU"
  if (/intel/i.test(detail)) return "drawing with an Intel GPU"
  return "drawing with a graphics stack that named itself"
}

function fontsTrait(detail: string): string {
  const match = /^(\d+) of (\d+) probed$/.exec(detail)
  return match ? `with ${match[1]} of ${match[2]} common fonts installed` : "with a recognizable set of fonts installed"
}

const TRAIT_BUILDERS: Partial<Record<NarrowingStep["key"], (detail: string) => string>> = {
  timezone: timezoneTrait,
  screen: screenTrait,
  platformLanguage: platformLanguageTrait,
  gpu: gpuTrait,
  canvas: () => "leaving a canvas signature few others share",
  audio: () => "carrying an audio signature of its own",
  fonts: fontsTrait
}

export function portraitTraits(steps: readonly NarrowingStep[]): string[] {
  return steps.map((step) => TRAIT_BUILDERS[step.key]?.(step.detail) ?? step.detail)
}

export function joinTraits(traits: readonly string[]): string {
  if (traits.length <= 1) return traits[0] ?? ""
  return `${traits.slice(0, -1).join(", ")}, and ${traits[traits.length - 1]}`
}

// The closing beat must scale with the arithmetic: "it's you" is only honest
// when the model says the description fits almost nobody else. A hardened
// browser (or canvas mitigation) raises `remaining`, and this line is where
// that defense visibly pays off.
export function portraitCloser(remaining: number): string {
  if (remaining < 10) return "That isn't a demographic. It's you."
  if (remaining < 10_000) return "That's a small town's worth of people — and every additional read shrinks it."
  return "That's still a crowd — and every additional read shrinks it."
}
