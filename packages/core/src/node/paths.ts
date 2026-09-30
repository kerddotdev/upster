import { homedir } from "node:os"
import { join } from "node:path"

export function isDevFlavor(env: NodeJS.ProcessEnv = process.env) {
  return env.UPSTER_FLAVOR === "dev"
}

export function defaultDataDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir()
) {
  const dev = isDevFlavor(env)
  if (platform === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      dev ? "Upster Dev" : "Upster"
    )
  }

  return join(
    env.XDG_DATA_HOME || join(home, ".local", "share"),
    dev ? "upster-dev" : "upster"
  )
}

export function runtimeStatePath(dataDir: string) {
  return join(dataDir, "runtime.json")
}

export function serviceLockPath(dataDir: string) {
  return join(dataDir, "service.lock")
}

export function serviceLogPath(dataDir: string) {
  return join(dataDir, "service.log")
}
