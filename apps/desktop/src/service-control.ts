import { existsSync } from "node:fs"
import { homedir } from "node:os"

import type { DesktopServiceState } from "@upster/core"
import { readRuntimeState } from "@upster/core/node"
import {
  controlService,
  installFromBundle,
  readBundleVersion,
  readInstalledConfig,
  serviceStatus,
  stagedBundleDir,
} from "@upster/service"

import { DEFAULT_PORT, dataDir } from "./paths"

const READY_TIMEOUT_MS = 30_000

export async function getServiceState(): Promise<DesktopServiceState> {
  const status = await serviceStatus(dataDir(), existsSync)
  return {
    supported: status.supported,
    installed: status.installed,
    running: status.running !== null,
    origin: status.running?.origin ?? null,
  }
}

export async function waitForRuntime() {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = readRuntimeState(dataDir())
    if (state) {
      return state
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error("The Upster service did not become ready in time.")
}

export async function installBundledService(bundleDir: string) {
  const existing = readInstalledConfig(dataDir())
  await installFromBundle({
    bundleDir,
    dataDir: dataDir(),
    port: existing?.port ?? DEFAULT_PORT,
    workspaceRoots: existing?.workspaceRoots ?? [homedir()],
  })
  return waitForRuntime()
}

export async function ensureServiceRunning(bundleDir: string) {
  const bundled = readBundleVersion(bundleDir)
  const staged = readBundleVersion(stagedBundleDir(dataDir()))
  if (bundled !== null && bundled !== staged) {
    return installBundledService(bundleDir)
  }

  if (!readRuntimeState(dataDir())) {
    await controlService("start")
  }
  return waitForRuntime()
}

export async function stopService() {
  await controlService("stop")
}

export async function startService() {
  await controlService("start")
  return waitForRuntime()
}
