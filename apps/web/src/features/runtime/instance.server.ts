import { randomUUID } from "node:crypto"

import {
  listActiveRuns,
  listRuntimeInstances,
  updatePillStatus,
  updateRun,
  upsertRuntimeInstance,
} from "@/db/repositories.server"

const runtimeInstanceId = randomUUID()
const startedAt = new Date().toISOString()

function now() {
  return new Date().toISOString()
}

function canSignal(pid: number | null) {
  if (!pid) {
    return false
  }

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function getRuntimeInstanceId() {
  return runtimeInstanceId
}

export async function ensureRuntimeInstance() {
  await upsertRuntimeInstance({
    id: runtimeInstanceId,
    pid: process.pid,
    version: process.env.npm_package_version ?? "0.0.7",
    status: "running",
  })

  return runtimeInstanceId
}

export async function reconcileRuntimeRuns() {
  await ensureRuntimeInstance()
  const activeRuns = await listActiveRuns()
  const reconciled = []

  for (const run of activeRuns) {
    if (run.runtimeInstanceId === runtimeInstanceId) {
      continue
    }

    const appAlive = canSignal(run.appPid)
    const tunnelAlive = canSignal(run.tunnelPid)

    if (appAlive && tunnelAlive) {
      continue
    }

    await updateRun(run.id, {
      status: "error",
      stoppedAt: now(),
      stopReason: "stale",
      error: "Runtime process is no longer alive.",
    })
    await updatePillStatus(run.pillId, "error")
    reconciled.push(run.id)
  }

  return reconciled
}

export async function getRuntimeControlPlaneStatus() {
  await reconcileRuntimeRuns()

  return {
    instanceId: runtimeInstanceId,
    pid: process.pid,
    startedAt,
    heartbeatAt: now(),
    version: process.env.npm_package_version ?? "0.0.7",
    status: "running" as const,
    instances: await listRuntimeInstances(),
  }
}
