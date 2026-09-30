import { join, resolve } from "node:path"

import { defaultDataDir } from "@upster/core/node"

export const DEFAULT_PORT = 3377

export function desktopAssetPath(
  appPath: string,
  asset: "preload.cjs" | "onboarding.html" | "tray.png"
) {
  return join(appPath, "dist", asset)
}

export function dataDir() {
  return resolve(process.env.UPSTER_DATA_DIR || defaultDataDir())
}

export function resourcePath(
  isPackaged: boolean,
  resourcesPath: string,
  repoRoot: string,
  resource: "server-bundle" | "cli"
) {
  if (isPackaged) {
    return join(resourcesPath, resource === "cli" ? "upster" : resource)
  }

  if (resource === "cli") {
    return join(repoRoot, "apps", "cli", "dist", "upster")
  }

  return (
    process.env.UPSTER_SERVER_BUNDLE ??
    join(
      repoRoot,
      "dist",
      "server-bundle",
      `${process.platform}-${process.arch}`
    )
  )
}
