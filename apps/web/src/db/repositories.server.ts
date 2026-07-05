import { randomUUID } from "node:crypto"

import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm"
import { adminScopes, isAccessScope, type AccessScope } from "@upster/core"

import { db, ensureDatabase } from "@/db/client.server"
import { publishEvent } from "@/features/events/event-bus.server"
import {
  accessSessions,
  adminUsers,
  appSettings,
  capsules,
  cloudflareTunnels,
  events,
  pairingLinks,
  pillCommands,
  pillPorts,
  pillRuns,
  pills,
  runLogs,
  runtimeInstances,
  secretVaults,
} from "@/db/schema"
import type {
  CloudflareTunnel,
  CreatePillInput,
  Pill,
  PillCommand,
  PillDetail,
  PillListItem,
  PillPorts,
  PillRun,
  PillStatus,
  RunLog,
} from "@/features/pills/types"
import type { Capsule } from "@/features/capsules/types"

function now() {
  return new Date().toISOString()
}

function parseCommand(row: typeof pillCommands.$inferSelect): PillCommand {
  return {
    id: row.id,
    pillId: row.pillId,
    name: row.name,
    cwd: row.cwd,
    argv: JSON.parse(row.argvJson) as Array<string>,
    env: JSON.parse(row.envJson) as Record<string, string>,
    healthcheckPath: row.healthcheckPath,
  }
}

function parsePill(row: typeof pills.$inferSelect): Pill {
  return {
    ...row,
    status: row.status as PillStatus,
  }
}

function parseRun(row: typeof pillRuns.$inferSelect): PillRun {
  return {
    ...row,
    status: row.status as PillStatus,
    source: row.source as PillRun["source"],
    capsuleId: row.capsuleId,
    deployTarget: row.deployTarget as PillRun["deployTarget"],
    hostname: row.hostname,
  }
}

function parseCapsule(row: typeof capsules.$inferSelect): Capsule {
  return {
    id: row.id,
    pillId: row.pillId,
    status: row.status as Capsule["status"],
    path: row.path,
    sourcePath: row.sourcePath,
    includeNodeModules: row.includeNodeModules === 1,
    installDeps: row.installDeps === 1,
    packageManager: row.packageManager as Capsule["packageManager"],
    label: row.label,
    pinned: row.pinned === 1,
    git: {
      commit: row.gitCommit,
      branch: row.gitBranch,
      message: row.gitMessage,
      dirty: row.gitDirty === null ? null : row.gitDirty === 1,
    },
    sizeBytes: row.sizeBytes,
    fileCount: row.fileCount,
    buildDurationMs: row.buildDurationMs,
    previewHostname: row.previewHostname,
    previewTunnelId: row.previewTunnelId,
    previewTunnelName: row.previewTunnelName,
    previewDnsRecordId: row.previewDnsRecordId,
    buildLog: row.buildLog,
    error: row.error,
    builtAt: row.builtAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function parseTunnel(
  row: typeof cloudflareTunnels.$inferSelect
): CloudflareTunnel {
  return {
    ...row,
    configStatus: row.configStatus as CloudflareTunnel["configStatus"],
  }
}

function parseLog(row: typeof runLogs.$inferSelect): RunLog {
  return {
    id: row.id,
    runId: row.runId,
    stream: row.stream as RunLog["stream"],
    sequence: row.sequence,
    chunk: row.chunk,
    createdAt: row.createdAt,
  }
}

export async function createPillRecord(
  input: CreatePillInput & {
    slug: string
    argv: Array<string>
    repoPath: string
    cwd: string
  }
) {
  await ensureDatabase()

  const id = randomUUID()
  const createdAt = now()

  await db.insert(pills).values({
    id,
    name: input.name,
    slug: input.slug,
    repoPath: input.repoPath,
    defaultEnv: input.defaultEnv,
    status: "idle",
    createdAt,
    updatedAt: createdAt,
  })

  await db.insert(pillCommands).values({
    id: randomUUID(),
    pillId: id,
    name: input.commandName,
    cwd: input.cwd,
    argvJson: JSON.stringify(input.argv),
    envJson: JSON.stringify({ PORT: "$UPSTER_PORT" }),
    healthcheckPath: input.healthcheckPath ?? null,
  })

  return getPillDetail(id)
}

export async function listPills() {
  await ensureDatabase()

  const pillRows = await db.select().from(pills).orderBy(desc(pills.updatedAt))
  const portRows = await db.select().from(pillPorts)
  const tunnelRows = await db.select().from(cloudflareTunnels)
  const activeRunRows = await db
    .select()
    .from(pillRuns)
    .where(isNull(pillRuns.stoppedAt))
    .orderBy(desc(pillRuns.startedAt))

  return pillRows.map<PillListItem>((pillRow) => {
    const ports = portRows.find((row) => row.pillId === pillRow.id)
    const tunnel = tunnelRows.find((row) => row.pillId === pillRow.id)
    const activeRun = activeRunRows.find((row) => row.pillId === pillRow.id)

    return {
      ...parsePill(pillRow),
      appPort: ports?.appPort ?? null,
      metricsPort: ports?.metricsPort ?? null,
      hostname: activeRun?.hostname ?? tunnel?.hostname ?? null,
      activeRun: activeRun ? parseRun(activeRun) : null,
    }
  })
}

export async function getPillDetail(pillId: string): Promise<PillDetail> {
  await ensureDatabase()

  const [pillRow] = await db.select().from(pills).where(eq(pills.id, pillId))

  if (!pillRow) {
    throw new Error("Pill not found.")
  }

  const [ports] = await db
    .select()
    .from(pillPorts)
    .where(eq(pillPorts.pillId, pillId))
  const [tunnel] = await db
    .select()
    .from(cloudflareTunnels)
    .where(eq(cloudflareTunnels.pillId, pillId))
  const [activeRun] = await db
    .select()
    .from(pillRuns)
    .where(and(eq(pillRuns.pillId, pillId), isNull(pillRuns.stoppedAt)))
    .orderBy(desc(pillRuns.startedAt))
  const commandRows = await db
    .select()
    .from(pillCommands)
    .where(eq(pillCommands.pillId, pillId))
  const logRows = activeRun
    ? await db
        .select()
        .from(runLogs)
        .where(eq(runLogs.runId, activeRun.id))
        .orderBy(desc(runLogs.sequence))
        .limit(200)
    : []

  return {
    ...parsePill(pillRow),
    appPort: ports?.appPort ?? null,
    metricsPort: ports?.metricsPort ?? null,
    hostname: activeRun?.hostname ?? tunnel?.hostname ?? null,
    activeRun: activeRun ? parseRun(activeRun) : null,
    commands: commandRows.map(parseCommand),
    tunnel: tunnel ? parseTunnel(tunnel) : null,
    recentLogs: logRows.reverse().map(parseLog),
  }
}

export async function updatePillRecord(input: {
  pillId: string
  name: string
  defaultEnv: string
  command?: {
    commandId: string
    name: string
    cwd: string
    argv: Array<string>
    env: Record<string, string>
    healthcheckPath: string | null
  }
}) {
  await ensureDatabase()

  await db
    .update(pills)
    .set({
      name: input.name,
      defaultEnv: input.defaultEnv,
      updatedAt: now(),
    })
    .where(eq(pills.id, input.pillId))

  if (input.command) {
    await db
      .update(pillCommands)
      .set({
        name: input.command.name,
        cwd: input.command.cwd,
        argvJson: JSON.stringify(input.command.argv),
        envJson: JSON.stringify(input.command.env),
        healthcheckPath: input.command.healthcheckPath,
      })
      .where(eq(pillCommands.id, input.command.commandId))
  }

  return getPillDetail(input.pillId)
}

export async function deletePillRecord(pillId: string) {
  await ensureDatabase()
  await db.delete(pills).where(eq(pills.id, pillId))
}

export async function updatePillStatus(pillId: string, status: PillStatus) {
  await ensureDatabase()
  await db
    .update(pills)
    .set({ status, updatedAt: now() })
    .where(eq(pills.id, pillId))
  publishEvent({ domain: "runs", type: status, id: pillId })
}

export async function getPillCommand(pillId: string, commandName: string) {
  await ensureDatabase()

  const [row] = await db
    .select()
    .from(pillCommands)
    .where(
      and(eq(pillCommands.pillId, pillId), eq(pillCommands.name, commandName))
    )

  if (!row) {
    throw new Error("Pill command not found.")
  }

  return parseCommand(row)
}

export async function upsertPillPorts(ports: PillPorts) {
  await ensureDatabase()
  await db
    .insert(pillPorts)
    .values(ports)
    .onConflictDoUpdate({
      target: pillPorts.pillId,
      set: {
        appPort: ports.appPort,
        metricsPort: ports.metricsPort,
        lastCheckedAt: ports.lastCheckedAt,
        rotationCount: ports.rotationCount,
      },
    })
}

export async function getPillPorts(pillId: string) {
  await ensureDatabase()
  const [row] = await db
    .select()
    .from(pillPorts)
    .where(eq(pillPorts.pillId, pillId))

  return row ?? null
}

export async function upsertTunnel(tunnel: CloudflareTunnel) {
  await ensureDatabase()
  await db.insert(cloudflareTunnels).values(tunnel).onConflictDoUpdate({
    target: cloudflareTunnels.pillId,
    set: tunnel,
  })
}

export async function createRun(run: Omit<PillRun, "id" | "startedAt">) {
  await ensureDatabase()

  const record: PillRun = {
    ...run,
    id: randomUUID(),
    startedAt: now(),
  }

  await db.insert(pillRuns).values(record)
  return record
}

export async function updateRun(runId: string, patch: Partial<PillRun>) {
  await ensureDatabase()
  await db.update(pillRuns).set(patch).where(eq(pillRuns.id, runId))
}

export async function createCapsule(input: {
  id: string
  pillId: string
  status: Capsule["status"]
  path: string
  sourcePath: string
  includeNodeModules: boolean
  installDeps: boolean
  packageManager: Capsule["packageManager"]
  label: string | null
}) {
  await ensureDatabase()
  const ts = now()

  await db.insert(capsules).values({
    id: input.id,
    pillId: input.pillId,
    status: input.status,
    path: input.path,
    sourcePath: input.sourcePath,
    includeNodeModules: input.includeNodeModules ? 1 : 0,
    installDeps: input.installDeps ? 1 : 0,
    packageManager: input.packageManager ?? null,
    label: input.label,
    pinned: 0,
    createdAt: ts,
    updatedAt: ts,
  })

  publishEvent({ domain: "capsules", type: "created", id: input.id })
  return getCapsuleById(input.id)
}

export async function updateCapsule(
  id: string,
  patch: {
    status?: Capsule["status"]
    buildLog?: string | null
    error?: string | null
    builtAt?: string | null
    sizeBytes?: number | null
    fileCount?: number | null
    buildDurationMs?: number | null
    gitCommit?: string | null
    gitBranch?: string | null
    gitMessage?: string | null
    gitDirty?: boolean | null
    label?: string | null
    pinned?: boolean
    previewHostname?: string | null
    previewTunnelId?: string | null
    previewTunnelName?: string | null
    previewDnsRecordId?: string | null
  }
) {
  await ensureDatabase()

  await db
    .update(capsules)
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.buildLog !== undefined ? { buildLog: patch.buildLog } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(patch.builtAt !== undefined ? { builtAt: patch.builtAt } : {}),
      ...(patch.sizeBytes !== undefined ? { sizeBytes: patch.sizeBytes } : {}),
      ...(patch.fileCount !== undefined ? { fileCount: patch.fileCount } : {}),
      ...(patch.buildDurationMs !== undefined
        ? { buildDurationMs: patch.buildDurationMs }
        : {}),
      ...(patch.gitCommit !== undefined ? { gitCommit: patch.gitCommit } : {}),
      ...(patch.gitBranch !== undefined ? { gitBranch: patch.gitBranch } : {}),
      ...(patch.gitMessage !== undefined
        ? { gitMessage: patch.gitMessage }
        : {}),
      ...(patch.gitDirty !== undefined
        ? { gitDirty: patch.gitDirty === null ? null : patch.gitDirty ? 1 : 0 }
        : {}),
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.pinned !== undefined ? { pinned: patch.pinned ? 1 : 0 } : {}),
      ...(patch.previewHostname !== undefined
        ? { previewHostname: patch.previewHostname }
        : {}),
      ...(patch.previewTunnelId !== undefined
        ? { previewTunnelId: patch.previewTunnelId }
        : {}),
      ...(patch.previewTunnelName !== undefined
        ? { previewTunnelName: patch.previewTunnelName }
        : {}),
      ...(patch.previewDnsRecordId !== undefined
        ? { previewDnsRecordId: patch.previewDnsRecordId }
        : {}),
      updatedAt: now(),
    })
    .where(eq(capsules.id, id))

  publishEvent({ domain: "capsules", type: "updated", id })
  return getCapsuleById(id)
}

export async function getCapsuleById(id: string) {
  await ensureDatabase()
  const [row] = await db.select().from(capsules).where(eq(capsules.id, id))

  return row ? parseCapsule(row) : null
}

export async function listCapsules(pillId: string) {
  await ensureDatabase()
  const rows = await db
    .select()
    .from(capsules)
    .where(eq(capsules.pillId, pillId))
    .orderBy(desc(capsules.createdAt))

  return rows.map(parseCapsule)
}

export async function getLatestReadyCapsule(pillId: string) {
  await ensureDatabase()
  const [row] = await db
    .select()
    .from(capsules)
    .where(and(eq(capsules.pillId, pillId), eq(capsules.status, "ready")))
    .orderBy(desc(capsules.createdAt))

  return row ? parseCapsule(row) : null
}

export async function deleteCapsuleById(id: string) {
  await ensureDatabase()
  await db.delete(capsules).where(eq(capsules.id, id))
  publishEvent({ domain: "capsules", type: "deleted", id })
}

export async function deleteCapsulesByPill(pillId: string) {
  await ensureDatabase()
  await db.delete(capsules).where(eq(capsules.pillId, pillId))
  publishEvent({ domain: "capsules", type: "deleted", id: pillId })
}

export async function getRun(runId: string) {
  await ensureDatabase()
  const [row] = await db.select().from(pillRuns).where(eq(pillRuns.id, runId))

  return row ? parseRun(row) : null
}

export async function getActiveRun(pillId: string) {
  await ensureDatabase()
  const [row] = await db
    .select()
    .from(pillRuns)
    .where(and(eq(pillRuns.pillId, pillId), isNull(pillRuns.stoppedAt)))
    .orderBy(desc(pillRuns.startedAt))

  return row ? parseRun(row) : null
}

export async function listActiveRuns() {
  await ensureDatabase()
  const rows = await db
    .select()
    .from(pillRuns)
    .where(isNull(pillRuns.stoppedAt))
    .orderBy(desc(pillRuns.startedAt))

  return rows.map(parseRun)
}

export async function listRuns(pillId: string, limit = 20) {
  await ensureDatabase()
  const rows = await db
    .select()
    .from(pillRuns)
    .where(eq(pillRuns.pillId, pillId))
    .orderBy(desc(pillRuns.startedAt))
    .limit(limit)

  return rows.map(parseRun)
}

export async function deleteInactiveRuns(pillId: string) {
  await ensureDatabase()
  await db
    .delete(pillRuns)
    .where(and(eq(pillRuns.pillId, pillId), isNotNull(pillRuns.stoppedAt)))
}

export async function appendRunLog(log: Omit<RunLog, "id" | "createdAt">) {
  await ensureDatabase()

  const record: RunLog = {
    ...log,
    id: randomUUID(),
    createdAt: now(),
  }

  await db.insert(runLogs).values(record)
  return record
}

export async function getRunLogMaxSequence(runId: string) {
  await ensureDatabase()
  const [row] = await db
    .select({ value: sql<number>`coalesce(max(${runLogs.sequence}), 0)` })
    .from(runLogs)
    .where(eq(runLogs.runId, runId))

  return Number(row?.value ?? 0)
}

export async function getRunLogs(runId: string) {
  await ensureDatabase()
  const rows = await db
    .select()
    .from(runLogs)
    .where(eq(runLogs.runId, runId))
    .orderBy(desc(runLogs.sequence))
    .limit(300)

  return rows.reverse().map(parseLog)
}

export async function saveSecretVault(input: {
  name: string
  ciphertext: string
  salt: string
  nonce: string
  kdf: string
  version: number
  publicMetadata?: Record<string, unknown>
}) {
  await ensureDatabase()

  const updatedAt = now()

  await db
    .insert(secretVaults)
    .values({
      id: input.name,
      name: input.name,
      ciphertext: input.ciphertext,
      salt: input.salt,
      nonce: input.nonce,
      kdf: input.kdf,
      version: input.version,
      publicMetadataJson: JSON.stringify(input.publicMetadata ?? {}),
      createdAt: updatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: secretVaults.id,
      set: {
        ciphertext: input.ciphertext,
        salt: input.salt,
        nonce: input.nonce,
        kdf: input.kdf,
        version: input.version,
        publicMetadataJson: JSON.stringify(input.publicMetadata ?? {}),
        updatedAt,
      },
    })
}

export async function getSecretVault(name: string) {
  await ensureDatabase()
  const [row] = await db
    .select()
    .from(secretVaults)
    .where(eq(secretVaults.id, name))

  return row ?? null
}

export async function deleteSecretVault(name: string) {
  await ensureDatabase()
  await db.delete(secretVaults).where(eq(secretVaults.id, name))
}

export async function getAdminUser(id: string) {
  await ensureDatabase()
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, id))

  return row ?? null
}

export async function createAdminUser(input: {
  id: string
  passphraseVerifier: string
}) {
  await ensureDatabase()
  const ts = now()
  await db.insert(adminUsers).values({
    id: input.id,
    passphraseVerifier: input.passphraseVerifier,
    createdAt: ts,
    updatedAt: ts,
  })
}

export async function getAppSetting(key: string) {
  await ensureDatabase()
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))

  return row?.value ?? null
}

export async function setAppSetting(key: string, value: string) {
  await ensureDatabase()
  const updatedAt = now()
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt },
    })
}

export async function createAppSettingIfAbsent(key: string, value: string) {
  await ensureDatabase()
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: now() })
    .onConflictDoNothing({ target: appSettings.key })
}

export async function appendEvent(input: {
  type: string
  pillId?: string
  runId?: string
  actorSessionId?: string
  actorKind?: string
  source?: string
  message: string
  metadata?: Record<string, unknown>
}) {
  await ensureDatabase()
  await db.insert(events).values({
    id: randomUUID(),
    type: input.type,
    pillId: input.pillId ?? null,
    runId: input.runId ?? null,
    actorSessionId: input.actorSessionId ?? null,
    actorKind: input.actorKind ?? null,
    source: input.source ?? null,
    message: input.message,
    metadataJson: JSON.stringify(input.metadata ?? {}),
    createdAt: now(),
  })
}

export type AccessSessionKind = "dashboard" | "cli" | "agent" | "connection"

export type AccessSession = {
  id: string
  kind: AccessSessionKind
  subject: string
  label: string
  tokenHash: string | null
  scopes: Array<AccessScope>
  createdAt: string
  lastSeenAt: string | null
  expiresAt: string
  revokedAt: string | null
  userAgent: string | null
  remoteAddr: string | null
  metadata: Record<string, unknown>
}

function parseAccessSession(
  row: typeof accessSessions.$inferSelect
): AccessSession {
  return {
    id: row.id,
    kind: row.kind as AccessSessionKind,
    subject: row.subject,
    label: row.label,
    tokenHash: row.tokenHash,
    scopes: JSON.parse(row.scopesJson) as Array<AccessScope>,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    userAgent: row.userAgent,
    remoteAddr: row.remoteAddr,
    metadata: JSON.parse(row.metadataJson) as Record<string, unknown>,
  }
}

export async function createAccessSession(input: {
  kind: AccessSessionKind
  subject: string
  label: string
  tokenHash?: string | null
  scopes: Array<AccessScope>
  expiresAt: string
  userAgent?: string | null
  remoteAddr?: string | null
  metadata?: Record<string, unknown>
}) {
  await ensureDatabase()
  const createdAt = now()
  const record = {
    id: randomUUID(),
    kind: input.kind,
    subject: input.subject,
    label: input.label,
    tokenHash: input.tokenHash ?? null,
    scopesJson: JSON.stringify(input.scopes),
    createdAt,
    lastSeenAt: createdAt,
    expiresAt: input.expiresAt,
    revokedAt: null,
    userAgent: input.userAgent ?? null,
    remoteAddr: input.remoteAddr ?? null,
    metadataJson: JSON.stringify(input.metadata ?? {}),
  }

  await db.insert(accessSessions).values(record)
  return parseAccessSession(record)
}

export async function getAccessSession(id: string) {
  await ensureDatabase()
  const [row] = await db
    .select()
    .from(accessSessions)
    .where(eq(accessSessions.id, id))

  return row ? parseAccessSession(row) : null
}

export async function getAccessSessionByTokenHash(tokenHash: string) {
  await ensureDatabase()
  const [row] = await db
    .select()
    .from(accessSessions)
    .where(eq(accessSessions.tokenHash, tokenHash))

  return row ? parseAccessSession(row) : null
}

export async function listAccessSessions() {
  await ensureDatabase()
  const rows = await db
    .select()
    .from(accessSessions)
    .orderBy(desc(accessSessions.createdAt))

  return rows.map(parseAccessSession)
}

export async function revokeAccessSession(id: string) {
  await ensureDatabase()
  await db
    .update(accessSessions)
    .set({ revokedAt: now() })
    .where(eq(accessSessions.id, id))
  publishEvent({ domain: "sessions", type: "revoked", id })
}

export async function touchAccessSession(id: string) {
  await ensureDatabase()
  await db
    .update(accessSessions)
    .set({ lastSeenAt: now() })
    .where(eq(accessSessions.id, id))
}

export async function updateAccessSessionLabel(id: string, label: string) {
  await ensureDatabase()
  await db
    .update(accessSessions)
    .set({ label })
    .where(eq(accessSessions.id, id))
  publishEvent({ domain: "sessions", type: "updated", id })
}

export type PairingLink = {
  id: string
  tokenHash: string
  label: string
  createdBy: string
  createdAt: string
  expiresAt: string
  consumedAt: string | null
  connectionSessionId: string | null
  revokedAt: string | null
  scopes: Array<AccessScope>
}

export function parsePairingLinkScopes(
  scopesJson: string | null | undefined
): Array<AccessScope> {
  if (!scopesJson || scopesJson.trim() === "") {
    return [...adminScopes]
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(scopesJson)
  } catch {
    return [...adminScopes]
  }

  if (!Array.isArray(parsed)) {
    return [...adminScopes]
  }

  const scopes = parsed.filter(
    (scope): scope is AccessScope =>
      typeof scope === "string" && isAccessScope(scope)
  )

  return scopes.length ? scopes : [...adminScopes]
}

function parsePairingLink(row: typeof pairingLinks.$inferSelect): PairingLink {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    label: row.label,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    connectionSessionId: row.connectionSessionId,
    revokedAt: row.revokedAt,
    scopes: parsePairingLinkScopes(row.scopesJson),
  }
}

export async function createPairingLink(input: {
  tokenHash: string
  label: string
  createdBy: string
  expiresAt: string
  scopes: Array<AccessScope>
}) {
  await ensureDatabase()
  const record = {
    id: randomUUID(),
    tokenHash: input.tokenHash,
    label: input.label,
    createdBy: input.createdBy,
    createdAt: now(),
    expiresAt: input.expiresAt,
    consumedAt: null,
    connectionSessionId: null,
    revokedAt: null,
    scopesJson: JSON.stringify(input.scopes),
  }

  await db.insert(pairingLinks).values(record)
  publishEvent({ domain: "connections", type: "link-created" })
  return parsePairingLink(record)
}

export async function listPairingLinks() {
  await ensureDatabase()
  const rows = await db
    .select()
    .from(pairingLinks)
    .orderBy(desc(pairingLinks.createdAt))

  return rows.map(parsePairingLink)
}

export async function revokePairingLink(id: string) {
  await ensureDatabase()
  await db
    .update(pairingLinks)
    .set({ revokedAt: now() })
    .where(eq(pairingLinks.id, id))
  publishEvent({ domain: "connections", type: "link-revoked", id })
}

export async function consumePairingLink(
  tokenHash: string,
  connectionSessionId: string | null = null
): Promise<PairingLink | null> {
  await ensureDatabase()
  const ts = now()
  const [row] = await db
    .update(pairingLinks)
    .set({ consumedAt: ts, connectionSessionId })
    .where(
      and(
        eq(pairingLinks.tokenHash, tokenHash),
        isNull(pairingLinks.consumedAt),
        isNull(pairingLinks.revokedAt),
        gt(pairingLinks.expiresAt, ts)
      )
    )
    .returning()

  if (row) {
    publishEvent({ domain: "connections", type: "paired", id: row.id })
  }

  return row ? parsePairingLink(row) : null
}

export async function setPairingLinkConnectionSessionId(
  id: string,
  connectionSessionId: string
) {
  await ensureDatabase()
  await db
    .update(pairingLinks)
    .set({ connectionSessionId })
    .where(eq(pairingLinks.id, id))
}

export async function upsertRuntimeInstance(input: {
  id: string
  pid: number
  version: string
  status: "running" | "stopping" | "stale"
}) {
  await ensureDatabase()
  const ts = now()

  await db
    .insert(runtimeInstances)
    .values({
      id: input.id,
      pid: input.pid,
      startedAt: ts,
      heartbeatAt: ts,
      version: input.version,
      status: input.status,
    })
    .onConflictDoUpdate({
      target: runtimeInstances.id,
      set: {
        heartbeatAt: ts,
        version: input.version,
        status: input.status,
      },
    })
}

export async function listRuntimeInstances() {
  await ensureDatabase()
  return db
    .select()
    .from(runtimeInstances)
    .orderBy(desc(runtimeInstances.heartbeatAt))
}
