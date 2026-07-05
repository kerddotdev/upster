import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"

import { getUpsterConfig } from "@/config/env.server"
import * as schema from "@/db/schema"

const config = getUpsterConfig()
const client = createClient({
  url: config.databaseUrl,
  authToken: config.databaseAuthToken ?? undefined,
})

export const db = drizzle(client, { schema })

let initialization: Promise<void> | null = null

async function addColumnIfMissing(table: string, definition: string) {
  try {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (!message.toLowerCase().includes("duplicate column")) {
      throw error
    }
  }
}

async function recordMigration(id: string) {
  await client.execute({
    sql: `INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, CURRENT_TIMESTAMP)`,
    args: [id],
  })
}

export async function ensureDatabase() {
  if (!initialization) {
    initialization = runMigrations().catch((error) => {
      initialization = null
      throw error
    })
  }

  return initialization
}

async function runMigrations() {
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        passphrase_verifier TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS secret_vaults (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        salt TEXT NOT NULL,
        nonce TEXT NOT NULL,
        kdf TEXT NOT NULL,
        version INTEGER NOT NULL,
        public_metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS pills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        repo_path TEXT NOT NULL,
        default_env TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS pill_commands (
        id TEXT PRIMARY KEY,
        pill_id TEXT NOT NULL REFERENCES pills(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        cwd TEXT NOT NULL,
        argv_json TEXT NOT NULL,
        env_json TEXT NOT NULL,
        healthcheck_path TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS pill_ports (
        pill_id TEXT PRIMARY KEY REFERENCES pills(id) ON DELETE CASCADE,
        app_port INTEGER NOT NULL,
        metrics_port INTEGER NOT NULL,
        last_checked_at TEXT,
        rotation_count INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS cloudflare_tunnels (
        pill_id TEXT PRIMARY KEY REFERENCES pills(id) ON DELETE CASCADE,
        tunnel_id TEXT,
        tunnel_name TEXT NOT NULL,
        hostname TEXT NOT NULL,
        dns_record_id TEXT,
        config_status TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS pill_runs (
        id TEXT PRIMARY KEY,
        pill_id TEXT NOT NULL REFERENCES pills(id) ON DELETE CASCADE,
        command_name TEXT NOT NULL,
        app_pid INTEGER,
        tunnel_pid INTEGER,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        stopped_at TEXT,
        expires_at TEXT,
        runtime_instance_id TEXT,
        stop_reason TEXT,
        exit_code INTEGER,
        error TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS run_logs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES pill_runs(id) ON DELETE CASCADE,
        stream TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        chunk TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        pill_id TEXT,
        run_id TEXT,
        actor_session_id TEXT,
        actor_kind TEXT,
        source TEXT,
        message TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS access_sessions (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        label TEXT NOT NULL,
        token_hash TEXT,
        scopes_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        user_agent TEXT,
        remote_addr TEXT,
        metadata_json TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS pairing_links (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        connection_session_id TEXT,
        revoked_at TEXT,
        scopes_json TEXT NOT NULL DEFAULT '[]'
      )`,
      `CREATE TABLE IF NOT EXISTS runtime_instances (
        id TEXT PRIMARY KEY,
        pid INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        heartbeat_at TEXT NOT NULL,
        version TEXT NOT NULL,
        status TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS capsules (
        id TEXT PRIMARY KEY,
        pill_id TEXT NOT NULL REFERENCES pills(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        path TEXT NOT NULL,
        source_path TEXT NOT NULL,
        include_node_modules INTEGER NOT NULL,
        install_deps INTEGER NOT NULL,
        package_manager TEXT,
        label TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        git_commit TEXT,
        git_branch TEXT,
        git_message TEXT,
        git_dirty INTEGER,
        size_bytes INTEGER,
        file_count INTEGER,
        build_duration_ms INTEGER,
        build_log TEXT,
        error TEXT,
        built_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ],
    "write"
  )

  await addColumnIfMissing(
    "secret_vaults",
    `public_metadata_json TEXT NOT NULL DEFAULT '{}'`
  )
  await addColumnIfMissing("pill_runs", "runtime_instance_id TEXT")
  await addColumnIfMissing("pill_runs", "stop_reason TEXT")
  await addColumnIfMissing("events", "actor_session_id TEXT")
  await addColumnIfMissing("events", "actor_kind TEXT")
  await addColumnIfMissing("events", "source TEXT")
  await recordMigration("0001_scoped_cli_sessions")

  await addColumnIfMissing("pill_runs", "source TEXT")
  await recordMigration("0002_pill_capsules")

  await addColumnIfMissing("pill_runs", "capsule_id TEXT")
  await client.execute(`DROP TABLE IF EXISTS pill_capsules`)
  await recordMigration("0003_capsule_versions")

  await addColumnIfMissing("pill_runs", "deploy_target TEXT")
  await addColumnIfMissing("pill_runs", "hostname TEXT")
  await addColumnIfMissing("capsules", "preview_hostname TEXT")
  await addColumnIfMissing("capsules", "preview_tunnel_id TEXT")
  await addColumnIfMissing("capsules", "preview_tunnel_name TEXT")
  await addColumnIfMissing("capsules", "preview_dns_record_id TEXT")
  await recordMigration("0004_capsule_previews")

  await client.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_access_sessions_token_hash ON access_sessions(token_hash) WHERE token_hash IS NOT NULL`
  )
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_capsules_pill_id ON capsules(pill_id)`
  )
  await recordMigration("0005_auth_capsule_indexes")

  await client.execute(
    `CREATE TABLE IF NOT EXISTS pairing_links (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      connection_session_id TEXT,
      revoked_at TEXT
    )`
  )
  await recordMigration("0006_connections_pairing_links")

  await addColumnIfMissing(
    "pairing_links",
    `scopes_json TEXT NOT NULL DEFAULT '[]'`
  )
  await recordMigration("0007_pairing_link_scopes")
}
