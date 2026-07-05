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
  updateCapsule,
  updatePillStatus,
  updateRun,
  upsertPillPorts,
  upsertTunnel,
} from "@/db/repositories.server"
import { resolveCapsuleCwd } from "@/features/capsules/detect"
import { getUpsterConfig } from "@/config/env.server"
import {
  getAppPortRange,
  getCloudflaredBin,
  getMetricsPortRange,
} from "@/config/settings.server"
import { createCloudflareClient } from "@/features/cloudflare/client.server"
import type {
  CloudflareConfig,
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
  const [appPortRange, metricsPortRange] = await Promise.all([
    getAppPortRange(),
    getMetricsPortRange(),
  ])
  const existing = await getPillPorts(pillId)
  const app = await findAvailablePort(
    appPortRange,
    rotatePorts ? null : existing?.appPort
  )
  const metrics = await findAvailablePort(
    metricsPortRange,
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

async function prepareTunnel(input: {
  runId: string
  appPort: number
  config: CloudflareConfig
  hostname: string
  tunnelName: string
  existingTunnelId?: string | null
  existingDnsRecordId?: string | null
}) {
  const client = createCloudflareClient(input.config)

  await logRun(
    input.runId,
    "system",
    `Preparing Cloudflare tunnel ${input.hostname}\n`
  )

  const tunnel = input.existingTunnelId
    ? { id: input.existingTunnelId, name: input.tunnelName }
    : await client.getOrCreateRemoteTunnel(input.tunnelName)

  await client.updateTunnelConfig({
    tunnelId: tunnel.id,
    hostname: input.hostname,
    appPort: input.appPort,
  })

  const dnsRecord = await client.ensureDnsRecord({
    hostname: input.hostname,
    tunnelId: tunnel.id,
    existingRecordId: input.existingDnsRecordId,
  })
  const token = await client.fetchTunnelToken(tunnel.id)

  await logRun(
    input.runId,
    "system",
    `Cloudflare tunnel ready for ${input.hostname}\n`
  )

  return {
    token,
    tunnelId: tunnel.id,
    tunnelName: tunnel.name,
    dnsRecordId: dnsRecord.id,
  }
}

type ProcessDiagnostics = { spawnError: string | null }

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

  const diag: ProcessDiagnostics = { spawnError: null }

  child.stdout.on("data", (chunk: Buffer) => {
    void logRun(input.runId, "stdout", chunk.toString())
  })
  child.stderr.on("data", (chunk: Buffer) => {
    void logRun(input.runId, "stderr", chunk.toString())
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

  return `App process exited with code ${code ?? "unknown"}. See the diagnostics for the full output.`
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
  let capsule: Awaited<ReturnType<typeof getCapsuleById>> = null

  if (input.useCapsule || input.capsuleId) {
    capsule = input.capsuleId
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
  }

  const deployTarget = input.deployTarget ?? "production"

  if (deployTarget === "preview" && !capsule) {
    throw new Error("Preview deploys require a capsule.")
  }

  const cloudflareConfig = await requireUnlockedCloudflareConfig()

  const preview = deployTarget === "preview"
  const shortId = capsule ? capsule.id.slice(0, 8) : ""
  const servedHostname = preview
    ? `${pill.slug}-${shortId}.${cloudflareConfig.rootDomain}`
    : `${pill.slug}.${cloudflareConfig.rootDomain}`
  const tunnelName = preview
    ? (capsule?.previewTunnelName ?? `upster-${pill.slug}-${shortId}`)
    : (pill.tunnel?.tunnelName ?? `upster-${pill.slug}`)
  const existingTunnelId = preview
    ? capsule?.previewTunnelId
    : pill.tunnel?.tunnelId
  const existingDnsRecordId = preview
    ? capsule?.previewDnsRecordId
    : pill.tunnel?.dnsRecordId

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
    capsuleId: capsule?.id ?? null,
    deployTarget,
    hostname: servedHostname,
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

    const tunnelResult = await prepareTunnel({
      runId: run.id,
      appPort: ports.appPort,
      config: cloudflareConfig,
      hostname: servedHostname,
      tunnelName,
      existingTunnelId,
      existingDnsRecordId,
    })

    if (preview && capsule) {
      await updateCapsule(capsule.id, {
        previewHostname: servedHostname,
        previewTunnelId: tunnelResult.tunnelId,
        previewTunnelName: tunnelResult.tunnelName,
        previewDnsRecordId: tunnelResult.dnsRecordId,
      })
    } else {
      await upsertTunnel({
        pillId: input.pillId,
        tunnelId: tunnelResult.tunnelId,
        tunnelName: tunnelResult.tunnelName,
        hostname: servedHostname,
        dnsRecordId: tunnelResult.dnsRecordId,
        configStatus: "synced",
      })
    }

    const token = tunnelResult.token

    if (appExitCode !== undefined || appProcess.exitCode !== null) {
      throw new Error(
        describeAppFailure(appExitCode ?? appProcess.exitCode, appDiag)
      )
    }

    const cloudflaredBin = await getCloudflaredBin()
    const { child: tunnelProcess } = spawnLoggedProcess({
      runId: run.id,
      command: cloudflaredBin,
      args: [
        "tunnel",
        "--no-autoupdate",
        "--metrics",
        `127.0.0.1:${ports.metricsPort}`,
        "run",
      ],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TUNNEL_TOKEN: token,
      },
      streamName: "cloudflared",
    })

    managed.tunnelProcess = tunnelProcess

    // Re-check for an app exit that landed while cloudflared was spawning.
    if (appExitCode !== undefined || appProcess.exitCode !== null) {
      throw new Error(
        describeAppFailure(appExitCode ?? appProcess.exitCode, appDiag)
      )
    }

    await updateRun(run.id, {
      tunnelPid: tunnelProcess.pid ?? null,
      status: "running",
    })
    await updatePillStatus(input.pillId, "running")

    // Only delegate exits to handleAppExit once the "running" writes are done,
    // and re-check first: if the app died during those writes the exit handler
    // was skipped (startCompleted was still false), so mark it here. There is no
    // await between this check and startCompleted, so no exit can slip through
    // and overwrite the terminal state with a stale "running".
    if (appExitCode !== undefined || appProcess.exitCode !== null) {
      throw new Error(
        describeAppFailure(appExitCode ?? appProcess.exitCode, appDiag)
      )
    }

    managed.expiryTimer = scheduleExpiry(run, managed)
    startCompleted = true

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
    if (managed.expiryTimer) {
      clearTimeout(managed.expiryTimer)
    }
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
