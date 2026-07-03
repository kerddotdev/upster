import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { cp, readdir, rm, stat } from "node:fs/promises"
import { existsSync, mkdirSync } from "node:fs"
import { basename, join } from "node:path"

import { getUpsterConfig } from "@/config/env.server"
import {
  appendEvent,
  createCapsule,
  deleteCapsuleById,
  deleteCapsulesByPill,
  getActiveRun,
  getCapsuleById,
  getPillCommand,
  getPillDetail,
  listCapsules,
  updateCapsule,
} from "@/db/repositories.server"
import {
  detectPackageManager,
  resolveCapsuleCwd,
} from "@/features/capsules/detect"
import { captureGitMetadata } from "@/features/capsules/git.server"
import { buildInheritedEnv } from "@/features/processes/process-env"
import {
  assertAllowedCommand,
  ensureWorkspacePath,
} from "@/features/pills/validation"
import type {
  BuildCapsuleInput,
  Capsule,
  CapsuleInfo,
} from "@/features/capsules/types"

const BUILD_LOG_LIMIT = 8000

function now() {
  return new Date().toISOString()
}

function pillCapsulesRoot(pillId: string) {
  return join(getUpsterConfig().dataDir, "capsules", pillId)
}

function capsuleVersionRoot(pillId: string, capsuleId: string) {
  return join(pillCapsulesRoot(pillId), capsuleId)
}

function capsuleSourceDir(pillId: string, capsuleId: string) {
  return join(capsuleVersionRoot(pillId, capsuleId), "source")
}

async function measureDir(dir: string) {
  let sizeBytes = 0
  let fileCount = 0

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        const info = await stat(full)
        sizeBytes += info.size
        fileCount += 1
      }
    }
  }

  if (existsSync(dir)) {
    await walk(dir)
  }

  return { sizeBytes, fileCount }
}

export async function getPillDiskUsage(pillId: string) {
  const { sizeBytes } = await measureDir(pillCapsulesRoot(pillId))
  return sizeBytes
}

export async function getCapsuleInfo(pillId: string): Promise<CapsuleInfo> {
  const pill = await getPillDetail(pillId)
  const command = await getPillCommand(pillId, pill.defaultEnv)
  const detected = detectPackageManager(command.cwd)

  return {
    pillId,
    capsules: await listCapsules(pillId),
    source: {
      hasNodeModules: existsSync(join(command.cwd, "node_modules")),
      supportsInstall: detected !== null,
      detectedManager: detected?.manager ?? null,
    },
    diskBytes: await getPillDiskUsage(pillId),
  }
}

function runInstall(argv: Array<string>, cwd: string) {
  return new Promise<{ code: number | null; output: string }>(
    (resolvePromise) => {
      const child = spawn(argv[0], argv.slice(1), {
        cwd,
        env: buildInheritedEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      })

      let output = ""
      const append = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-BUILD_LOG_LIMIT)
      }

      child.stdout.on("data", append)
      child.stderr.on("data", append)
      child.on("error", (error) => {
        output = (output + `\n${error.message}\n`).slice(-BUILD_LOG_LIMIT)
        resolvePromise({ code: -1, output })
      })
      child.on("exit", (code) => {
        resolvePromise({ code, output })
      })
    }
  )
}

export async function buildCapsule(input: BuildCapsuleInput): Promise<Capsule> {
  const config = getUpsterConfig()
  const pill = await getPillDetail(input.pillId)
  const command = await getPillCommand(input.pillId, pill.defaultEnv)

  const repoPath = ensureWorkspacePath(
    pill.repoPath,
    config.workspaceRoots,
    config.hostWorkspaceRoot
  )
  const cwd = ensureWorkspacePath(
    command.cwd,
    config.workspaceRoots,
    config.hostWorkspaceRoot
  )

  const capsuleId = randomUUID()
  const sourceDir = capsuleSourceDir(input.pillId, capsuleId)
  const detected = detectPackageManager(cwd)
  const installDeps = input.installDeps && detected !== null

  await createCapsule({
    id: capsuleId,
    pillId: input.pillId,
    status: "building",
    path: sourceDir,
    sourcePath: repoPath,
    includeNodeModules: input.includeNodeModules,
    installDeps,
    packageManager: detected?.manager ?? null,
    label: input.label?.trim() ? input.label.trim() : null,
  })

  const startedAt = Date.now()

  try {
    mkdirSync(sourceDir, { recursive: true })

    await cp(repoPath, sourceDir, {
      recursive: true,
      filter: (source) => {
        const name = basename(source)

        if (name === ".git") {
          return false
        }

        if (!input.includeNodeModules && name === "node_modules") {
          return false
        }

        return true
      },
    })

    let buildLog: string | null = null

    if (installDeps && detected) {
      assertAllowedCommand(detected.installArgv, config.allowedCommands)
      const installCwd = resolveCapsuleCwd(repoPath, cwd, sourceDir)
      const result = await runInstall(detected.installArgv, installCwd)
      buildLog = result.output

      if (result.code !== 0) {
        throw new Error(
          `Dependency install failed (${detected.manager}, exit ${result.code ?? "null"}).`
        )
      }
    }

    const { sizeBytes, fileCount } = await measureDir(sourceDir)
    const git = await captureGitMetadata(repoPath)

    const capsule = await updateCapsule(capsuleId, {
      status: "ready",
      buildLog,
      error: null,
      builtAt: now(),
      sizeBytes,
      fileCount,
      buildDurationMs: Date.now() - startedAt,
      gitCommit: git.commit,
      gitBranch: git.branch,
      gitMessage: git.message,
      gitDirty: git.dirty,
    })

    await appendEvent({
      type: "capsule.built",
      pillId: input.pillId,
      message: "Built pill capsule.",
      metadata: {
        capsuleId,
        includeNodeModules: input.includeNodeModules,
        installDeps,
        packageManager: detected?.manager ?? null,
      },
    })

    return capsule as Capsule
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build capsule."

    await rm(capsuleVersionRoot(input.pillId, capsuleId), {
      recursive: true,
      force: true,
    }).catch(() => undefined)

    await updateCapsule(capsuleId, {
      status: "error",
      error: message,
      buildDurationMs: Date.now() - startedAt,
    })

    throw error
  }
}

export async function deleteCapsuleVersion(capsuleId: string) {
  const capsule = await getCapsuleById(capsuleId)

  if (!capsule) {
    return
  }

  const activeRun = await getActiveRun(capsule.pillId)

  if (activeRun?.capsuleId === capsuleId) {
    throw new Error(
      "This snapshot is currently deployed. Stop the deployment before deleting it."
    )
  }

  await rm(capsuleVersionRoot(capsule.pillId, capsuleId), {
    recursive: true,
    force: true,
  })
  await deleteCapsuleById(capsuleId)
  await appendEvent({
    type: "capsule.deleted",
    pillId: capsule.pillId,
    message: "Deleted pill capsule.",
    metadata: { capsuleId },
  })
}

export async function removeAllCapsules(pillId: string) {
  await rm(pillCapsulesRoot(pillId), { recursive: true, force: true })
  await deleteCapsulesByPill(pillId)
}
