import { spawnSync } from "node:child_process"
import { chmodSync, cpSync, mkdirSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const desktop = join(root, "apps", "desktop")

const platform = (process.env.UPSTER_TARGET_PLATFORM ?? process.platform) as
  | "darwin"
  | "linux"
const arch = (process.env.UPSTER_TARGET_ARCH ?? process.arch) as "arm64" | "x64"
const dirOnly = process.argv.includes("--dir")
const publish = process.argv.includes("--publish")

function run(cmd: string, args: Array<string>, cwd: string, env = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed`)
  }
}

const env = { UPSTER_TARGET_PLATFORM: platform, UPSTER_TARGET_ARCH: arch }
const bunTarget = `bun-${platform}-${arch === "x64" ? "x64" : "arm64"}`

run("bun", ["run", "build"], root)
run("bun", ["run", "scripts/package-server.ts"], root, env)
run("bun", ["run", "build.ts"], join(root, "apps", "cli"), {
  UPSTER_CLI_TARGET: bunTarget,
  UPSTER_CLI_OUTFILE: "dist/upster-desktop",
})

const stage = join(desktop, "stage")
rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
cpSync(
  join(root, "dist", "server-bundle", `${platform}-${arch}`),
  join(stage, "server-bundle"),
  { recursive: true, verbatimSymlinks: true }
)
cpSync(
  join(root, "apps", "cli", "dist", "upster-desktop"),
  join(stage, "upster")
)
chmodSync(join(stage, "upster"), 0o755)

run("bun", ["run", "build"], desktop)
run(
  "bunx",
  [
    "electron-builder",
    platform === "darwin" ? "--mac" : "--linux",
    `--${arch}`,
    ...(dirOnly ? ["--dir"] : []),
    "--publish",
    publish ? "always" : "never",
  ],
  desktop
)
