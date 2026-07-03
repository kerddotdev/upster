import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"

import {
  appendEvent,
  appendRunLog,
  createRun,
  getActiveRun,
  getCapsuleById,
  getLatestReadyCapsule,
  getPillCommand,
  getPillDetail,
  getPillPorts,
  updatePillStatus,
  updateRun,
  upsertPillPorts,
  upsertTunnel,
} from "@/db/repositories.server"
import { resolveCapsuleCwd } from "@/features/capsules/detect"
import { getUpsterConfig } from "@/config/env.server"
import { createCloudflareClient } from "@/features/cloudflare/client.server"
import type {
  CloudflareConfig,
  CloudflareTunnel,
  PillRun,
  RunLog,
  StartPillInput,
} from "@/features/pills/types"
import { assertAllowedCommand } from "@/features/pills/validation"
import { findAvailablePort } from "@/features/pills/ports.server"
import { buildProcessEnv } from "@/features/processes/process-env"
import { emitRunLog, nextLogSequence } from "@/features/terminal/log-bus.server"
import {
  getRuntimeInstanceId,
  reconcileRuntimeRuns,
} from "@/features/runtime/instance.server"
import { requireUnlockedCloudflareConfig } from "@/features/secrets/vault-session.server"

type ManagedRun = {
  runId: string
  pillId: string
  appProcess: ChildProcessWithoutNullStreams | null
  tunnelProcess: ChildProcessWithoutNullStreams | null
  expiryTimer: ReturnType<typeof setTimeout> | null
  stopping: boolean
}

const managedRuns = new Map<string, ManagedRun>()

function now() {
  return new Date().toISOString()
}

async function logRun(runId: string, stream: RunLog["stream"], chunk: string) {
  const log = await appendRunLog({
    runId,
    stream,
    sequence: await nextLogSequence(runId),
    chunk,
  })
  emitRunLog(log)
}

async function preparePorts(pillId: string, rotatePorts: boolean) {
  const config = getUpsterConfig()
  const existing = await getPillPorts(pillId)
  const app = await findAvailablePort(
    config.appPortRange,
    rotatePorts ? null : existing?.appPort
  )
  const metrics = await findAvailablePort(
    config.metricsPortRange,
    rotatePorts ? null : existing?.metricsPort
  )
  const rotationCount =
    (existing?.rotationCount ?? 0) +
    (app.rotated || metrics.rotated || rotatePorts ? 1 : 0)

  await upsertPillPorts({
    pillId,
    appPort: app.port,
    metricsPort: metrics.port,
    lastCheckedAt: now(),
    rotationCount,
  })

  if (app.rotated || metrics.rotated || rotatePorts) {
    await appendEvent({
      type: "ports.rotated",
      pillId,
      message: "Rotated pill ports.",
      metadata: {
        appPort: app.port,
        metricsPort: metrics.port,
      },
    })
  }

  return {
    appPort: app.port,
    metricsPort: metrics.port,
  }
}

async function prepareCloudflareTunnel(input: {
  runId: string
  pillId: string
  appPort: number
  config: CloudflareConfig
}) {
  const pill = await getPillDetail(input.pillId)
  const client = createCloudflareClient(input.config)
  const hostname = `${pill.slug}.${input.config.rootDomain}`
  const tunnelName = pill.tunnel?.tunnelName ?? `upster-${pill.slug}`

  await logRun(
    input.runId,
    "system",
    `Preparing Cloudflare tunnel ${hostname}\n`
  )

  const tunnel = pill.tunnel?.tunnelId
    ? { id: pill.tunnel.tunnelId, name: tunnelName }
    : await client.getOrCreateRemoteTunnel(tunnelName)

  await client.updateTunnelConfig({
    tunnelId: tunnel.id,
    hostname,
    appPort: input.appPort,
  })

  const dnsRecord = await client.ensureDnsRecord({
    hostname,
    tunnelId: tunnel.id,
    existingRecordId: pill.tunnel?.dnsRecordId,
  })
  const token = await client.fetchTunnelToken(tunnel.id)
  const record: CloudflareTunnel = {
    pillId: input.pillId,
    tunnelId: tunnel.id,
    tunnelName: tunnel.name,
    hostname,
    dnsRecordId: dnsRecord.id,
    configStatus: "synced",
  }

  await upsertTunnel(record)
  await logRun(
    input.runId,
    "system",
    `Cloudflare tunnel ready for ${hostname}\n`
  )

  return {
    token,
    tunnel: record,
  }
}

type ProcessDiagnostics = { spawnError: string | null; stderrTail: string }

function spawnLoggedProcess(input: {
  runId: string
  command: string
  args: Array<string>
  cwd?: string
  env?: NodeJS.ProcessEnv
  streamName: string
}) {
  const child = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    stdio: "pipe",
  })

  const diag: ProcessDiagnostics = { spawnError: null, stderrTail: "" }

  child.stdout.on("data", (chunk: Buffer) => {
    void logRun(input.runId, "stdout", chunk.toString())
  })
  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString()
    diag.stderrTail = (diag.stderrTail + text).slice(-2000)
    void logRun(input.runId, "stderr", text)
  })
  child.on("error", (error) => {
    diag.spawnError = error.message
    void logRun(
      input.runId,
      "system",
      `${input.streamName} failed: ${error.message}\n`
    )
  })

  return { child, diag }
}

function killProcess(child: ChildProcessWithoutNullStreams | null) {
  if (!child || child.killed) {
    return
  }

  child.kill("SIGTERM")
  setTimeout(() => {
    if (!child.killed) {
      child.kill("SIGKILL")
    }
  }, 3000).unref()
}

function waitForEarlyExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
) {
  return new Promise<number | null | undefined>((resolve) => {
    const timeout = setTimeout(() => {
      child.off("exit", onExit)
      resolve(undefined)
    }, timeoutMs)

    timeout.unref()

    function onExit(code: number | null) {
      clearTimeout(timeout)
      resolve(code)
    }

    child.once("exit", onExit)
  })
}

function describeAppFailure(code: number | null, diag: ProcessDiagnostics) {
  if (diag.spawnError) {
    if (diag.spawnError.includes("ENOENT")) {
      return `Could not start the app: the command was not found (${diag.spawnError}). Check the pill command and that its executable is available in the runtime.`
    }
    return `Could not start the app process: ${diag.spawnError}.`
  }

  const base = `App process exited with code ${code ?? "unknown"}`
  const tail = diag.stderrTail.trim()
  return tail ? `${base}. Last output:\n${tail.slice(-800)}` : `${base}.`
}

function scheduleExpiry(run: PillRun, managed: ManagedRun) {
  if (!run.expiresAt) {
    return null
  }

  const delay = new Date(run.expiresAt).getTime() - Date.now()

  if (delay <= 0) {
    void stopPillRun({ pillId: run.pillId, runId: run.id, reason: "expired" })
    return null
  }

  return setTimeout(() => {
    void stopPillRun({
      pillId: managed.pillId,
      runId: managed.runId,
      reason: "expired",
    })
  }, delay)
}

export async function startPillRuntime(input: StartPillInput) {
  await reconcileRuntimeRuns()
  const activeRun = await getActiveRun(input.pillId)

  if (activeRun) {
    throw new Error("Pill already has an active run.")
  }

  const pill = await getPillDetail(input.pillId)
  const command = await getPillCommand(input.pillId, input.commandName)

  assertAllowedCommand(command.argv, getUpsterConfig().allowedCommands)

  let runCwd = command.cwd
  let runSource: "live" | "capsule" = "live"
  let runCapsuleId: string | null = null

  if (input.useCapsule || input.capsuleId) {
    const capsule = input.capsuleId
      ? await getCapsuleById(input.capsuleId)
      : await getLatestReadyCapsule(input.pillId)

    if (!capsule || capsule.status !== "ready") {
      throw new Error("No ready capsule to start. Build a capsule first.")
    }

    if (capsule.pillId !== input.pillId) {
      throw new Error("Capsule does not belong to this pill.")
    }

    runCwd = resolveCapsuleCwd(pill.repoPath, command.cwd, capsule.path)
    runSource = "capsule"
    runCapsuleId = capsule.id
  }

  const cloudflareConfig = await requireUnlockedCloudflareConfig()
  const ports = await preparePorts(input.pillId, input.rotatePorts ?? false)

  await updatePillStatus(input.pillId, "starting")

  const run = await createRun({
    pillId: input.pillId,
    commandName: input.commandName,
    appPid: null,
    tunnelPid: null,
    status: "starting",
    stoppedAt: null,
    expiresAt: input.expiresAt ?? null,
    runtimeInstanceId: getRuntimeInstanceId(),
    stopReason: null,
    exitCode: null,
    error: null,
    source: runSource,
    capsuleId: runCapsuleId,
  })

  const managed: ManagedRun = {
    runId: run.id,
    pillId: input.pillId,
    appProcess: null,
    tunnelProcess: null,
    expiryTimer: null,
    stopping: false,
  }
  managedRuns.set(run.id, managed)

  try {
    await logRun(
      run.id,
      "system",
      `Starting ${pill.name} on ${ports.appPort} from ${
        runSource === "capsule" ? "capsule" : "live source"
      }\n`
    )

    const { child: appProcess, diag: appDiag } = spawnLoggedProcess({
      runId: run.id,
      command: command.argv[0],
      args: command.argv.slice(1),
      cwd: runCwd,
      env: buildProcessEnv(command, ports.appPort),
      streamName: "App process",
    })

    managed.appProcess = appProcess
    await updateRun(run.id, { appPid: appProcess.pid ?? null })

    let appExitCode: number | null | undefined
    let startCompleted = false

    appProcess.on("exit", (code) => {
      appExitCode = code
      if (startCompleted) {
        void handleAppExit(run.id, input.pillId, code)
      }
    })

    const earlyExitCode = await waitForEarlyExit(appProcess, 1000)
    if (earlyExitCode !== undefined) {
      throw new Error(describeAppFailure(earlyExitCode, appDiag))
    }

    const { token } = await prepareCloudflareTunnel({
      runId: run.id,
      pillId: input.pillId,
      appPort: ports.appPort,
      config: cloudflareConfig,
    })

    if (appExitCode !== undefined || appProcess.exitCode !== null) {
      throw new Error(
        describeAppFailure(appExitCode ?? appProcess.exitCode, appDiag)
      )
    }

    const config = getUpsterConfig()
    const { child: tunnelProcess } = spawnLoggedProcess({
      runId: run.id,
      command: config.cloudflaredBin,
      args: [
        "tunnel",
        "--no-autoupdate",
        "--metrics",
        `127.0.0.1:${ports.metricsPort}`,
        "run",
        "--token",
        token,
      ],
      streamName: "cloudflared",
    })

    managed.tunnelProcess = tunnelProcess
    managed.expiryTimer = scheduleExpiry(run, managed)
    startCompleted = true

    await updateRun(run.id, {
      tunnelPid: tunnelProcess.pid ?? null,
      status: "running",
    })
    await updatePillStatus(input.pillId, "running")

    tunnelProcess.on("exit", (code) => {
      void handleTunnelExit(run.id, input.pillId, code)
    })

    await appendEvent({
      type: "pill.started",
      pillId: input.pillId,
      runId: run.id,
      message: "Started pill run.",
      metadata: {
        appPort: ports.appPort,
        metricsPort: ports.metricsPort,
      },
    })

    return {
      ...run,
      appPid: appProcess.pid ?? null,
      tunnelPid: tunnelProcess.pid ?? null,
      status: "running" as const,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start pill."
    killProcess(managed.appProcess)
    killProcess(managed.tunnelProcess)
    managedRuns.delete(run.id)
    await logRun(run.id, "system", `${message}\n`)
    await updateRun(run.id, {
      status: "error",
      stoppedAt: now(),
      stopReason: "error",
      error: message,
    })
    await updatePillStatus(input.pillId, "error")
    throw error
  }
}

export async function stopPillRun(input: {
  pillId: string
  runId?: string
  reason?: "manual" | "expired" | "process-exit"
}) {
  const run = input.runId ? null : await getActiveRun(input.pillId)
  const runId = input.runId ?? run?.id

  if (!runId) {
    await updatePillStatus(input.pillId, "idle")
    return
  }

  const managed = managedRuns.get(runId)
  const status = input.reason === "expired" ? "expired" : "idle"

  if (managed) {
    managed.stopping = true
    if (managed.expiryTimer) {
      clearTimeout(managed.expiryTimer)
    }
    killProcess(managed.tunnelProcess)
    killProcess(managed.appProcess)
    managedRuns.delete(runId)
  }

  await logRun(runId, "system", `Stopped run: ${input.reason ?? "manual"}\n`)
  await updateRun(runId, {
    status,
    stoppedAt: now(),
    stopReason: input.reason ?? "manual",
  })
  await updatePillStatus(input.pillId, status)
  await appendEvent({
    type: "pill.stopped",
    pillId: input.pillId,
    runId,
    message: "Stopped pill run.",
    metadata: {
      reason: input.reason ?? "manual",
    },
  })
}

async function handleAppExit(
  runId: string,
  pillId: string,
  code: number | null
) {
  const managed = managedRuns.get(runId)

  if (!managed || managed.stopping) {
    return
  }

  await logRun(
    runId,
    "system",
    `App process exited with code ${code ?? "null"}\n`
  )
  killProcess(managed.tunnelProcess)
  managedRuns.delete(runId)
  await updateRun(runId, {
    status: code === 0 ? "idle" : "error",
    stoppedAt: now(),
    stopReason: "process-exit",
    exitCode: code,
    error: code === 0 ? null : "App process exited unexpectedly.",
  })
  await updatePillStatus(pillId, code === 0 ? "idle" : "error")
}

async function handleTunnelExit(
  runId: string,
  pillId: string,
  code: number | null
) {
  const managed = managedRuns.get(runId)

  if (!managed || managed.stopping) {
    return
  }

  await logRun(
    runId,
    "system",
    `cloudflared exited with code ${code ?? "null"}\n`
  )
  await updateRun(runId, {
    status: "error",
    stopReason: "process-exit",
    error: "cloudflared exited unexpectedly.",
  })
  await updatePillStatus(pillId, "error")
}
