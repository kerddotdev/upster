import { getUpsterConfig } from "@/config/env.server"
import {
  createPillRecord,
  deletePillRecord,
  getActiveRun,
  getPillDetail,
  listPills,
  updatePillRecord,
} from "@/db/repositories.server"
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
  return updatePillRecord({
    ...input,
    name: input.name.trim(),
    defaultEnv: input.defaultEnv.trim(),
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
