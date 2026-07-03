import { access, copyFile, mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Copies the packaged Chrome artifact into the Proof site's public/downloads
// under a version-stamped name, so `/observe` always links to a reproducible,
// versioned build. Run via `pnpm release:observe` (which builds + packages
// first). Override the site location with PROOF_SITE_DIR if the repos do not
// sit side by side under the same parent directory.
const here = path.dirname(fileURLToPath(import.meta.url))
const extensionRoot = path.resolve(here, "..")

const pkg = JSON.parse(await readFile(path.join(extensionRoot, "package.json"), "utf8"))
const version = pkg.version

const zipSource = path.join(extensionRoot, "build", "chrome-mv3-prod.zip")
try {
  await access(zipSource)
} catch {
  throw new Error(`Missing ${zipSource}. Run "pnpm build:chrome && pnpm package" first (pnpm release:observe does this for you).`)
}

const siteDir = process.env.PROOF_SITE_DIR ?? path.resolve(extensionRoot, "..", "kenshiki-web")
const downloadsDir = path.join(siteDir, "public", "downloads")
try {
  await access(siteDir)
} catch {
  throw new Error(`Proof site not found at ${siteDir}. Set PROOF_SITE_DIR to the kenshiki-web checkout.`)
}

await mkdir(downloadsDir, { recursive: true })
const target = path.join(downloadsDir, `pulse-observer-${version}-chrome.zip`)
await copyFile(zipSource, target)

console.log(`Copied Pulse Observer ${version} -> ${path.relative(siteDir, target)}`)
console.log(`Served at /downloads/pulse-observer-${version}-chrome.zip`)
