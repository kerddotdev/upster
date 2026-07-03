export type PillStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "error"
  | "expired"

export type PillCommand = {
  id: string
  pillId: string
  name: string
  cwd: string
  argv: Array<string>
  env: Record<string, string>
  healthcheckPath: string | null
}

export type Pill = {
  id: string
  name: string
  slug: string
  repoPath: string
  defaultEnv: string
  status: PillStatus
  createdAt: string
  updatedAt: string
}

export type PillPorts = {
  pillId: string
  appPort: number
  metricsPort: number
  lastCheckedAt: string | null
  rotationCount: number
}

export type CloudflareTunnel = {
  pillId: string
  tunnelId: string | null
  tunnelName: string
  hostname: string
  dnsRecordId: string | null
  configStatus: "pending" | "synced" | "error"
}

export type PillRunSource = "live" | "capsule"

export type PillRun = {
  id: string
  pillId: string
  commandName: string
  appPid: number | null
  tunnelPid: number | null
  status: PillStatus
  startedAt: string
  stoppedAt: string | null
  expiresAt: string | null
  runtimeInstanceId: string | null
  stopReason: string | null
  exitCode: number | null
  error: string | null
  source: PillRunSource | null
  capsuleId: string | null
}

export type RunLog = {
  id: string
  runId: string
  stream: "stdout" | "stderr" | "system"
  sequence: number
  chunk: string
  createdAt: string
}

export type PillListItem = Pill & {
  appPort: number | null
  metricsPort: number | null
  hostname: string | null
  activeRun: PillRun | null
}

export type PillDetail = PillListItem & {
  commands: Array<PillCommand>
  tunnel: CloudflareTunnel | null
  recentLogs: Array<RunLog>
}

export type CloudflareConfig = {
  accountId: string
  zoneId: string
  rootDomain: string
  apiToken: string
}

export type CreatePillInput = {
  name: string
  slug?: string
  repoPath: string
  defaultEnv: string
  commandName: string
  command: string
  cwd?: string
  healthcheckPath?: string
}

export type UpdatePillInput = {
  pillId: string
  name: string
  defaultEnv: string
}

export type StartPillInput = {
  pillId: string
  commandName: string
  expiresAt?: string
  rotatePorts?: boolean
  useCapsule?: boolean
  capsuleId?: string
}
