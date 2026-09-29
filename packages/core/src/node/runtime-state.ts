import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"

import { runtimeStatePath, serviceLockPath } from "./paths"

export type RuntimeState = {
  pid: number
  port: number
  origin: string
  version: string
}

export function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

function readPid(path: string) {
  try {
    const pid = Number(JSON.parse(readFileSync(path, "utf-8")).pid)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

export function acquireServiceLock(dataDir: string) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const path = serviceLockPath(dataDir)

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(path, JSON.stringify({ pid: process.pid }), {
        flag: "wx",
        mode: 0o600,
      })
      return () => {
        if (readPid(path) === process.pid) {
          rmSync(path, { force: true })
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error
      }
      const holder = readPid(path)
      if (holder !== null && holder !== process.pid && isProcessAlive(holder)) {
        throw new Error(
          `Another Upster server is already running (pid ${holder}).`
        )
      }
      rmSync(path, { force: true })
    }
  }

  throw new Error("Could not acquire the Upster service lock.")
}

export function writeRuntimeState(dataDir: string, state: RuntimeState) {
  writeFileSync(runtimeStatePath(dataDir), JSON.stringify(state), {
    mode: 0o600,
  })
}

export function readRuntimeState(dataDir: string): RuntimeState | null {
  try {
    const state = JSON.parse(
      readFileSync(runtimeStatePath(dataDir), "utf-8")
    ) as Partial<RuntimeState>
    if (
      typeof state.pid !== "number" ||
      typeof state.port !== "number" ||
      typeof state.origin !== "string" ||
      typeof state.version !== "string" ||
      !isProcessAlive(state.pid)
    ) {
      return null
    }
    return state as RuntimeState
  } catch {
    return null
  }
}

export function clearRuntimeState(dataDir: string) {
  if (readPid(runtimeStatePath(dataDir)) === process.pid) {
    rmSync(runtimeStatePath(dataDir), { force: true })
  }
}
