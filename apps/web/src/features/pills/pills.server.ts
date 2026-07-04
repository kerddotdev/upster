import { getUpsterConfig } from "@/config/env.server"
import {
  createPillRecord,
  deletePillRecord,
  getActiveRun,
  getPillDetail,
  listPills,
  updatePillRecord,
} from "@/db/repositories.server"
import { removeAllCapsules } from "@/features/capsules/capsule.server"
import { createCloudflareClient } from "@/features/cloudflare/client.server"
import type {
  CloudflareConfig,
  CreatePillInput,
  UpdatePillInput,
} from "@/features/pills/types"
import { getUnlockedCloudflareConfig } from "@/features/secrets/vault-session.server"
import {
  assertAllowedCommand,
  assertValidHostnameLabel,
  ensureWorkspacePath,
  parseCommand,
  slugify,
} from "@/features/pills/validation"

export async function createPill(input: CreatePillInput) {
  const config = getUpsterConfig()
  const name = input.name.trim()
  const slug = slugify(input.slug || name)

  assertValidHostnameLabel(slug)

  const repoPath = ensureWorkspacePath(
    input.repoPath,
    config.workspaceRoots,
    config.hostWorkspaceRoot
  )
  const cwd = ensureWorkspacePath(
    input.cwd || repoPath,
    config.workspaceRoots,
    config.hostWorkspaceRoot
  )
  const argv = parseCommand(input.command)

  assertAllowedCommand(argv, config.allowedCommands)

  return createPillRecord({
    ...input,
    name,
    slug,
    repoPath,
    cwd,
    argv,
  })
}

export async function updatePill(input: UpdatePillInput) {
  const config = getUpsterConfig()
  const pill = await getPillDetail(input.pillId)
  const currentCommand =
    pill.commands.find((command) => command.name === pill.defaultEnv) ??
    pill.commands[0]

  const editsCommand =
    input.command !== undefined ||
    input.commandName !== undefined ||
    input.cwd !== undefined ||
    input.env !== undefined ||
    input.healthcheckPath !== undefined

  let command:
    | {
        commandId: string
        name: string
        cwd: string
        argv: Array<string>
        env: Record<string, string>
        healthcheckPath: string | null
      }
    | undefined

  if (editsCommand) {
    if (!currentCommand) {
      throw new Error("Pill has no command to update.")
    }

    const argv =
      input.command !== undefined
        ? parseCommand(input.command)
        : currentCommand.argv

    if (input.command !== undefined) {
      assertAllowedCommand(argv, config.allowedCommands)
    }

    const cwd =
      input.cwd !== undefined
        ? ensureWorkspacePath(
            input.cwd,
            config.workspaceRoots,
            config.hostWorkspaceRoot
          )
        : currentCommand.cwd

    command = {
      commandId: currentCommand.id,
      name: (input.commandName ?? currentCommand.name).trim(),
      cwd,
      argv,
      env: input.env ?? currentCommand.env,
      healthcheckPath:
        input.healthcheckPath !== undefined
          ? input.healthcheckPath
          : currentCommand.healthcheckPath,
    }
  }

  const defaultEnv = (
    input.defaultEnv?.trim() ||
    command?.name ||
    pill.defaultEnv
  ).trim()

  return updatePillRecord({
    pillId: input.pillId,
    name: input.name.trim(),
    defaultEnv,
    command,
  })
}

type CloudflareCleanup = "ok" | "failed" | "skipped"

export async function deletePill(input: { pillId: string }) {
  const activeRun = await getActiveRun(input.pillId)

  if (activeRun) {
    throw new Error("Stop the pill before deleting it.")
  }

  const cloudflareConfig = await getUnlockedCloudflareConfig()
  const cloudflareCleanup: CloudflareCleanup = cloudflareConfig
    ? await cleanupCloudflareResources(input.pillId, cloudflareConfig)
    : "skipped"

  await removeAllCapsules(input.pillId)
  await deletePillRecord(input.pillId)

  return { cloudflareCleanup }
}

async function cleanupCloudflareResources(
  pillId: string,
  config: CloudflareConfig
): Promise<CloudflareCleanup> {
  const pill = await getPillDetail(pillId)

  if (!pill.tunnel) {
    return "skipped"
  }

  const client = createCloudflareClient(config)
  let failed = false

  if (pill.tunnel.dnsRecordId) {
    try {
      await client.deleteDnsRecord(pill.tunnel.dnsRecordId)
    } catch {
      failed = true
    }
  }

  if (pill.tunnel.tunnelId) {
    try {
      await client.deleteTunnel(pill.tunnel.tunnelId)
    } catch {
      failed = true
    }
  }

  return failed ? "failed" : "ok"
}

export async function getPills() {
  return listPills()
}

export async function getPillStatus(input: { pillId: string }) {
  return getPillDetail(input.pillId)
}

export function getRuntimeSettings() {
  const config = getUpsterConfig()

  return {
    workspaceRoots: config.workspaceRoots,
    hostWorkspaceRoot: config.hostWorkspaceRoot,
    allowedCommands: config.allowedCommands,
    appPortRange: config.appPortRange,
    metricsPortRange: config.metricsPortRange,
    publicOrigin: config.publicOrigin,
    cloudflaredBin: config.cloudflaredBin,
  }
}
