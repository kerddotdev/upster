import { sql } from "drizzle-orm"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
})

export const adminUsers = sqliteTable("admin_users", {
  id: text("id").primaryKey(),
  passphraseVerifier: text("passphrase_verifier").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
})

export const secretVaults = sqliteTable("secret_vaults", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ciphertext: text("ciphertext").notNull(),
  salt: text("salt").notNull(),
  nonce: text("nonce").notNull(),
  kdf: text("kdf").notNull(),
  version: integer("version").notNull(),
  publicMetadataJson: text("public_metadata_json").notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
})

export const pills = sqliteTable("pills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  repoPath: text("repo_path").notNull(),
  defaultEnv: text("default_env").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
})

export const pillCommands = sqliteTable("pill_commands", {
  id: text("id").primaryKey(),
  pillId: text("pill_id")
    .notNull()
    .references(() => pills.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  cwd: text("cwd").notNull(),
  argvJson: text("argv_json").notNull(),
  envJson: text("env_json").notNull(),
  healthcheckPath: text("healthcheck_path"),
})

export const pillPorts = sqliteTable("pill_ports", {
  pillId: text("pill_id")
    .primaryKey()
    .references(() => pills.id, { onDelete: "cascade" }),
  appPort: integer("app_port").notNull(),
  metricsPort: integer("metrics_port").notNull(),
  lastCheckedAt: text("last_checked_at"),
  rotationCount: integer("rotation_count").notNull(),
})

export const cloudflareTunnels = sqliteTable("cloudflare_tunnels", {
  pillId: text("pill_id")
    .primaryKey()
    .references(() => pills.id, { onDelete: "cascade" }),
  tunnelId: text("tunnel_id"),
  tunnelName: text("tunnel_name").notNull(),
  hostname: text("hostname").notNull(),
  dnsRecordId: text("dns_record_id"),
  configStatus: text("config_status").notNull(),
})

export const pillRuns = sqliteTable("pill_runs", {
  id: text("id").primaryKey(),
  pillId: text("pill_id")
    .notNull()
    .references(() => pills.id, { onDelete: "cascade" }),
  commandName: text("command_name").notNull(),
  appPid: integer("app_pid"),
  tunnelPid: integer("tunnel_pid"),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  stoppedAt: text("stopped_at"),
  expiresAt: text("expires_at"),
  runtimeInstanceId: text("runtime_instance_id"),
  stopReason: text("stop_reason"),
  exitCode: integer("exit_code"),
  error: text("error"),
  source: text("source"),
  capsuleId: text("capsule_id"),
  deployTarget: text("deploy_target"),
  hostname: text("hostname"),
})

export const capsules = sqliteTable("capsules", {
  id: text("id").primaryKey(),
  pillId: text("pill_id")
    .notNull()
    .references(() => pills.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  path: text("path").notNull(),
  sourcePath: text("source_path").notNull(),
  includeNodeModules: integer("include_node_modules").notNull(),
  installDeps: integer("install_deps").notNull(),
  packageManager: text("package_manager"),
  label: text("label"),
  pinned: integer("pinned").notNull().default(0),
  gitCommit: text("git_commit"),
  gitBranch: text("git_branch"),
  gitMessage: text("git_message"),
  gitDirty: integer("git_dirty"),
  sizeBytes: integer("size_bytes"),
  fileCount: integer("file_count"),
  buildDurationMs: integer("build_duration_ms"),
  previewHostname: text("preview_hostname"),
  previewTunnelId: text("preview_tunnel_id"),
  previewTunnelName: text("preview_tunnel_name"),
  previewDnsRecordId: text("preview_dns_record_id"),
  buildLog: text("build_log"),
  error: text("error"),
  builtAt: text("built_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
})

export const runLogs = sqliteTable("run_logs", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => pillRuns.id, { onDelete: "cascade" }),
  stream: text("stream").notNull(),
  sequence: integer("sequence").notNull(),
  chunk: text("chunk").notNull(),
  createdAt: text("created_at").notNull(),
})

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  pillId: text("pill_id"),
  runId: text("run_id"),
  actorSessionId: text("actor_session_id"),
  actorKind: text("actor_kind"),
  source: text("source"),
  message: text("message").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
})

export const schemaMigrations = sqliteTable("schema_migrations", {
  id: text("id").primaryKey(),
  appliedAt: text("applied_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
})

export const accessSessions = sqliteTable("access_sessions", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  subject: text("subject").notNull(),
  label: text("label").notNull(),
  tokenHash: text("token_hash"),
  scopesJson: text("scopes_json").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at"),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  userAgent: text("user_agent"),
  remoteAddr: text("remote_addr"),
  metadataJson: text("metadata_json").notNull(),
})

export const pairingLinks = sqliteTable("pairing_links", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  connectionSessionId: text("connection_session_id"),
  revokedAt: text("revoked_at"),
  scopesJson: text("scopes_json").notNull().default("[]"),
})

export const runtimeInstances = sqliteTable("runtime_instances", {
  id: text("id").primaryKey(),
  pid: integer("pid").notNull(),
  startedAt: text("started_at").notNull(),
  heartbeatAt: text("heartbeat_at").notNull(),
  version: text("version").notNull(),
  status: text("status").notNull(),
})
