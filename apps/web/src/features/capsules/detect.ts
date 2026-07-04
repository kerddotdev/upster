import { existsSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"

import type { PackageManager } from "@/features/capsules/types"

export type DetectedManager = {
  manager: PackageManager
  installArgv: Array<string>
}

export function detectPackageManager(dir: string): DetectedManager | null {
  if (!existsSync(join(dir, "package.json"))) {
    return null
  }

  if (existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "bun.lockb"))) {
    return { manager: "bun", installArgv: ["bun", "install"] }
  }

  if (existsSync(join(dir, "pnpm-lock.yaml"))) {
    return { manager: "pnpm", installArgv: ["pnpm", "install"] }
  }

  if (existsSync(join(dir, "yarn.lock"))) {
    return { manager: "yarn", installArgv: ["yarn", "install"] }
  }

  if (existsSync(join(dir, "package-lock.json"))) {
    return { manager: "npm", installArgv: ["npm", "install"] }
  }

  return { manager: "npm", installArgv: ["npm", "install"] }
}

export function resolveCapsuleCwd(
  repoPath: string,
  cwd: string,
  capsulePath: string
) {
  const rel = relative(resolve(repoPath), resolve(cwd))

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Command working directory is outside the pill repo path.")
  }

  return resolve(capsulePath, rel)
}
