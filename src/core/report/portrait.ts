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
// names belong here; anything unmapped falls back to its UTC offset (also
// zone-level, also city-free) via zoneLabel — never the raw IANA id, whose
// "America/Detroit" would surface the very city name this table avoids.
const ZONE_NAMES: Record<string, string> = {
  "America/Los_Angeles": "US Pacific time",
  "America/Denver": "US Mountain time",
  "America/Phoenix": "US Mountain time",
  "America/Chicago": "US Central time",
  "America/New_York": "US Eastern time",
  "America/Anchorage": "Alaska time",
  "Pacific/Honolulu": "Hawaii time"
}

// The current UTC offset of an IANA zone as a city-free label ("UTC−5"),
// derived without hardcoding so any zone on earth degrades to an honest,
// zone-level phrasing instead of leaking its city. DST-dependent by nature;
// that's fine — it's a tease for the real location, not a precise claim.
function utcOffsetLabel(timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date())
    const name = parts.find((part) => part.type === "timeZoneName")?.value
    if (name && /GMT|UTC/.test(name)) return name.replace("GMT", "UTC").replace("-", "−")
  } catch {
    /* invalid zone, or a runtime without shortOffset support */
  }
  return null
}

// The zone label shared by the portrait trait and the panel's IP tease, so
// both read the same and neither ever prints the raw IANA id.
export function zoneLabel(detail: string): string {
  const named = ZONE_NAMES[detail]
  if (named) return named
  const offset = utcOffsetLabel(detail)
  return offset ? `the ${offset} time zone` : "your device's local time zone"
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

// "English (US)", not Intl.DisplayNames' "American English": the parenthesis
// form reads as a setting the user recognizes from their own machine.
function languageName(tag: string): string {
  const match = /^([a-z]{2,3})(?:-([A-Za-z0-9]+))*$/.exec(tag)
  if (!match) return tag
  // Base is the language subtag, never the whole tag: an unknown language
  // (DisplayNames echoes the code) must not keep the region baked in and then
  // have it appended again — "xx-US" would become "xx-US (US)".
  const language = match[1] ?? tag
  let base = language
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(language)
    if (name && name !== language) base = name
  } catch {
    /* keep the raw language subtag */
  }
  const region = tag.split("-").find((part) => /^[A-Z]{2}$/.test(part))
  return region ? `${base} (${region})` : base
}

// Traits are second-person clauses completing "You …" — the mirror talks TO
// the person it describes, not about a specimen.
function timezoneTrait(detail: string): string {
  // Named zones read with "on" (live on US Pacific time); the offset and
  // generic fallbacks read with "in" (live in the UTC−5 time zone).
  return ZONE_NAMES[detail] ? `live on ${zoneLabel(detail)}` : `live in ${zoneLabel(detail)}`
}

function screenTrait(detail: string): string {
  const match = /^(\d+x\d+) @([\d.]+)x$/.exec(detail)
  if (!match) return `look at a ${detail} screen`
  const [, resolution, ratio] = match
  return ratio === "1" ? `look at a ${resolution} screen` : `look at a ${resolution} screen at ${ratio}× density`
}

function platformLanguageTrait(detail: string): string {
  // buildNarrowingModel composes this detail as "platform · language" (either
  // part may be absent). Re-split what the model joined.
  const parts = detail.split(" · ").map((part) => part.trim()).filter(Boolean)
  const platform = parts.find((part) => !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(part))
  const language = parts.find((part) => /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(part))
  if (platform && language) return `use ${platformName(platform)} set to ${languageName(language)}`
  if (platform) return `use ${platformName(platform)}`
  if (language) return `browse in ${languageName(language)}`
  return `use ${detail}`
}

function gpuTrait(detail: string): string {
  if (/apple/i.test(detail)) return "draw with an Apple GPU"
  if (/nvidia|geforce|rtx|gtx/i.test(detail)) return "draw with an NVIDIA GPU"
  if (/amd|radeon/i.test(detail)) return "draw with an AMD GPU"
  if (/intel/i.test(detail)) return "draw with an Intel GPU"
  return "draw with a graphics stack that names itself"
}

function fontsTrait(detail: string): string {
  const match = /^(\d+) of (\d+) probed$/.exec(detail)
  return match ? `have ${match[1]} of ${match[2]} common fonts installed` : "have a recognizable set of fonts installed"
}

const TRAIT_BUILDERS: Partial<Record<NarrowingStep["key"], (detail: string) => string>> = {
  timezone: timezoneTrait,
  screen: screenTrait,
  platformLanguage: platformLanguageTrait,
  gpu: gpuTrait,
  canvas: () => "leave a canvas signature few others share",
  audio: () => "carry an audio signature of your own",
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
