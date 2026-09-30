import { existsSync } from "node:fs"
import { homedir } from "node:os"

import type { DesktopServiceState } from "@upster/core"
import { readRuntimeState } from "@upster/core/node"
import {
  controlService,
  installFromBundle,
  readBundleIdentity,
  readInstalledConfig,
  serviceStatus,
  stagedBundleDir,
} from "@upster/service"

import { dataDir, defaultPort } from "./paths"

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

export async function installBundledService(
  bundleDir: string,
  extraWorkspaceRoots: Array<string> = []
) {
  const existing = readInstalledConfig(dataDir())
  const workspaceRoots = [
    ...new Set([
      ...(existing?.workspaceRoots ??
        (extraWorkspaceRoots.length ? [] : [homedir()])),
      ...extraWorkspaceRoots,
    ]),
  ]
  await installFromBundle({
    bundleDir,
    dataDir: dataDir(),
    port: existing?.port ?? defaultPort(),
    workspaceRoots,
  })
  return waitForRuntime()
}

export async function ensureServiceRunning(bundleDir: string) {
  const bundled = readBundleIdentity(bundleDir)
  const staged = readBundleIdentity(stagedBundleDir(dataDir()))
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

export async function waitForStopped() {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (!readRuntimeState(dataDir())) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error("The Upster service did not stop in time.")
}

export async function startService() {
  await controlService("start")
  return waitForRuntime()
}
