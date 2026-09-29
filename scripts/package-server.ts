import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

type Target = { platform: "darwin" | "linux"; arch: "arm64" | "x64" }
type LockEntry = { url: string; sha256: string }
type Lock = Record<string, LockEntry>

const NODE_VERSION = "22.16.0"
const CLOUDFLARED_VERSION = "2025.8.1"

const root = resolve(import.meta.dirname, "..")
const lockPath = join(root, "scripts", "server-bundle.lock.json")
const updateLock = process.argv.includes("--update-lock")
const lockOnly = process.argv.includes("--lock-only")

const target: Target = {
  platform: (process.env.UPSTER_TARGET_PLATFORM ??
    process.platform) as Target["platform"],
  arch: (process.env.UPSTER_TARGET_ARCH ?? process.arch) as Target["arch"],
}

if (!["darwin", "linux"].includes(target.platform)) {
  throw new Error(`Unsupported platform: ${target.platform}`)
}

function run(cmd: string, args: Array<string>, cwd: string) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed`)
  }
}

const lock: Lock = existsSync(lockPath)
  ? JSON.parse(readFileSync(lockPath, "utf-8"))
  : {}

async function download(name: string, url: string) {
  const response = await fetch(url, { redirect: "follow" })
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`)
  }
  const data = Buffer.from(await response.arrayBuffer())
  const sha256 = createHash("sha256").update(data).digest("hex")
  const pinned = lock[name]

  if (updateLock || !pinned) {
    if (!updateLock) {
      throw new Error(
        `No pinned checksum for ${name}. Run with --update-lock and review ${lockPath}.`
      )
    }
    lock[name] = { url, sha256 }
  } else if (pinned.url !== url || pinned.sha256 !== sha256) {
    throw new Error(`Checksum mismatch for ${name}`)
  }
  return data
}

const nodeArch = target.arch
const nodeName = `node-v${NODE_VERSION}-${target.platform}-${nodeArch}`
const cloudflaredAsset =
  target.platform === "darwin"
    ? `cloudflared-darwin-${target.arch === "x64" ? "amd64" : "arm64"}.tgz`
    : `cloudflared-linux-${target.arch === "x64" ? "amd64" : "arm64"}`

const outDir = join(
  root,
  "dist",
  "server-bundle",
  `${target.platform}-${target.arch}`
)
const scratch = join(tmpdir(), `upster-bundle-${process.pid}`)
rmSync(outDir, { recursive: true, force: true })
rmSync(scratch, { recursive: true, force: true })
mkdirSync(join(outDir, "runtime"), { recursive: true })
mkdirSync(join(outDir, "app"), { recursive: true })
mkdirSync(scratch, { recursive: true })

const nodeTar = await download(
  `node-${target.platform}-${target.arch}`,
  `https://nodejs.org/dist/v${NODE_VERSION}/${nodeName}.tar.gz`
)
writeFileSync(join(scratch, "node.tar.gz"), nodeTar)
run("tar", ["-xzf", "node.tar.gz", `${nodeName}/bin/node`], scratch)
cpSync(join(scratch, nodeName, "bin", "node"), join(outDir, "runtime", "node"))

const cloudflaredData = await download(
  `cloudflared-${target.platform}-${target.arch}`,
  `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${cloudflaredAsset}`
)
if (cloudflaredAsset.endsWith(".tgz")) {
  writeFileSync(join(scratch, "cloudflared.tgz"), cloudflaredData)
  run("tar", ["-xzf", "cloudflared.tgz", "cloudflared"], scratch)
  cpSync(join(scratch, "cloudflared"), join(outDir, "runtime", "cloudflared"))
} else {
  writeFileSync(join(outDir, "runtime", "cloudflared"), cloudflaredData)
}
chmodSync(join(outDir, "runtime", "node"), 0o755)
chmodSync(join(outDir, "runtime", "cloudflared"), 0o755)

if (updateLock) {
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
}

if (lockOnly) {
  rmSync(scratch, { recursive: true, force: true })
  rmSync(outDir, { recursive: true, force: true })
  process.exit(0)
}

const appDir = join(outDir, "app")
const webDir = join(root, "apps", "web")
if (!existsSync(join(webDir, "dist", "server", "server.js"))) {
  throw new Error("apps/web/dist is missing. Run `bun run build` first.")
}
cpSync(join(webDir, "dist"), join(appDir, "dist"), { recursive: true })

run(
  "bun",
  [
    "build",
    "server.prod.ts",
    "--target=node",
    "--outfile",
    join(appDir, "server.mjs"),
  ],
  webDir
)

const webPackage = JSON.parse(
  readFileSync(join(webDir, "package.json"), "utf-8")
) as { dependencies: Record<string, string> }
const BUILD_ONLY_DEPENDENCIES = new Set([
  "shadcn",
  "@tailwindcss/vite",
  "@tanstack/router-plugin",
  "@tanstack/react-devtools",
  "@tanstack/react-router-devtools",
  "tailwindcss",
  "tw-animate-css",
  "@fontsource-variable/geist",
  "@xterm/xterm",
])
const dependencies = Object.fromEntries(
  Object.entries(webPackage.dependencies).filter(
    ([name, version]) =>
      !version.startsWith("workspace:") && !BUILD_ONLY_DEPENDENCIES.has(name)
  )
)
const rootPackage = JSON.parse(
  readFileSync(join(root, "package.json"), "utf-8")
) as { version: string }

writeFileSync(
  join(appDir, "package.json"),
  JSON.stringify(
    {
      name: "upster-server",
      private: true,
      type: "module",
      version: process.env.UPSTER_VERSION ?? rootPackage.version,
      dependencies,
    },
    null,
    2
  )
)

run(
  "npm",
  [
    "install",
    "--omit=dev",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    `--os=${target.platform}`,
    `--cpu=${target.arch}`,
  ],
  appDir
)

spawnSync("find", [join(appDir, "node_modules"), "-name", "*.map", "-delete"])

writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify(
    {
      version: process.env.UPSTER_VERSION ?? rootPackage.version,
      platform: target.platform,
      arch: target.arch,
      node: NODE_VERSION,
      cloudflared: CLOUDFLARED_VERSION,
    },
    null,
    2
  )
)

rmSync(scratch, { recursive: true, force: true })
console.log(`Server bundle written to ${outDir}`)
