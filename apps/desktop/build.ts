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
for (const asset of [
  "tray.png",
  "tray@2x.png",
  "trayTemplate.png",
  "trayTemplate@2x.png",
  "icon.png",
]) {
  cpSync(join(here, "assets", asset), join(dist, asset))
}
