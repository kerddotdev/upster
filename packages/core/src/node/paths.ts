import { homedir } from "node:os"
import { join } from "node:path"

export function defaultDataDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir()
) {
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "Upster")
  }

  return join(env.XDG_DATA_HOME || join(home, ".local", "share"), "upster")
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
