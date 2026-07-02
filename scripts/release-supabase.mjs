#!/usr/bin/env node
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const root = path.resolve(import.meta.dirname, "..")
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))

const version = process.env.RELEASE_VERSION ?? packageJson.version
const target = process.env.EXTENSION_TARGET ?? "chrome-mv3"
const supabaseUrl = (process.env.SUPABASE_URL ?? "https://rldcspgvbthxwklvsuhc.supabase.co").replace(/\/$/, "")
const bucket = process.env.SUPABASE_BUCKET ?? "proof-extension"
const projectRef = process.env.SUPABASE_PROJECT_REF ?? "rldcspgvbthxwklvsuhc"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_STORAGE_KEY ?? await readServiceRoleKeyFromSupabaseCli()

if (!key) {
  throw new Error("Set SUPABASE_SERVICE_ROLE_KEY/SUPABASE_STORAGE_KEY or run `supabase login` before uploading release artifacts.")
}

function artifactName(kind) {
  return kind === "latest"
    ? `proof-extension-${target}-latest.zip`
    : `proof-extension-${target}-${version}.zip`
}

async function run(command, args) {
  console.log(`$ ${command} ${args.join(" ")}`)
  await execFileAsync(command, args, { cwd: root, stdio: "inherit" })
}

async function readServiceRoleKeyFromSupabaseCli() {
  try {
    const { stdout } = await execFileAsync("supabase", ["projects", "api-keys", "--project-ref", projectRef, "--output", "json"], {
      cwd: root,
      maxBuffer: 1024 * 1024
    })
    const keys = JSON.parse(stdout)
    const serviceRoleKey = Array.isArray(keys)
      ? keys.find((item) => item.name === "service_role" || item.name === "service_role key" || item.type === "service_role")?.api_key
      : keys.service_role ?? keys.serviceRole ?? keys.SERVICE_ROLE_KEY
    return typeof serviceRoleKey === "string" && serviceRoleKey.length > 0 ? serviceRoleKey : undefined
  } catch {
    return undefined
  }
}

async function uploadObject(objectPath, zipBytes) {
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Cache-Control": objectPath.includes("/latest/") ? "no-cache" : "public, max-age=31536000, immutable",
      "Content-Type": "application/zip",
      "x-upsert": "true"
    },
    body: new Blob([zipBytes], { type: "application/zip" })
  })

  if (!response.ok) {
    throw new Error(`Supabase upload failed for ${objectPath}: ${response.status} ${await response.text()}`)
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`
}

await run("pnpm", ["exec", "plasmo", "build", `--target=${target}`])
await run("pnpm", ["exec", "plasmo", "package", `--target=${target}`])

const zipPath = path.join(root, "build", `${target}-prod.zip`)
const zipBytes = await readFile(zipPath)

const versionedPath = `releases/${version}/${artifactName("versioned")}`
const latestPath = `releases/latest/${artifactName("latest")}`

const versionedUrl = await uploadObject(versionedPath, zipBytes)
const latestUrl = await uploadObject(latestPath, zipBytes)

console.log(JSON.stringify({ bucket, target, version, versionedUrl, latestUrl }, null, 2))
