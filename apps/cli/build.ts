import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

const rootPkg = JSON.parse(
  readFileSync(join(here, "..", "..", "package.json"), "utf-8")
) as { version: string }

const version = process.env.UPSTER_VERSION ?? rootPkg.version
const outfile = process.env.UPSTER_CLI_OUTFILE ?? "dist/upster"
const target = process.env.UPSTER_CLI_TARGET

const args = [
  "build",
  "src/index.ts",
  "--compile",
  "--define",
  `process.env.UPSTER_CLI_VERSION=${JSON.stringify(version)}`,
  "--outfile",
  outfile,
]

if (target) {
  args.push(`--target=${target}`)
}

const result = spawnSync("bun", args, { stdio: "inherit", cwd: here })

process.exit(result.status ?? 1)
