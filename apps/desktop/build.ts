import { cpSync, mkdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

const here = import.meta.dirname
const dist = join(here, "dist")
mkdirSync(dist, { recursive: true })

for (const [entry, out] of [
  ["src/main.ts", "main.cjs"],
  ["src/preload.ts", "preload.cjs"],
] as const) {
  const result = spawnSync(
    "bun",
    [
      "build",
      entry,
      "--target=node",
      "--format=cjs",
      "--external",
      "electron",
      "--external",
      "electron-updater",
      "--outfile",
      join(dist, out),
    ],
    { cwd: here, stdio: "inherit" }
  )
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

cpSync(join(here, "src", "onboarding.html"), join(dist, "onboarding.html"))
cpSync(join(here, "assets", "tray.png"), join(dist, "tray.png"))
