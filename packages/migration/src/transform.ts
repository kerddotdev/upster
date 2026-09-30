import type { Client } from "@libsql/client"

export function remapPath(value: string, from: string, to: string) {
  if (value === from) {
    return to
  }
  return value.startsWith(`${from}/`)
    ? `${to}${value.slice(from.length)}`
    : value
}

export type TransformInput = {
  workspaceRoot: string
  dataDir: string
  sessionSecret: string | null
  now: string
}

async function hasColumn(db: Client, table: string, column: string) {
  const info = await db.execute(`PRAGMA table_info(${table})`)
  return info.rows.some((row) => row.name === column)
}

async function remapColumn(
  db: Client,
  table: string,
  column: string,
  from: string,
  to: string
) {
  if (!(await hasColumn(db, table, column))) {
    return
  }
  const rows = await db.execute(
    `SELECT rowid AS rid, ${column} AS value FROM ${table}`
  )
  for (const row of rows.rows) {
    const value = row.value
    if (typeof value !== "string") {
      continue
    }
    const next = remapPath(value, from, to)
    if (next !== value) {
      await db.execute({
        sql: `UPDATE ${table} SET ${column} = ? WHERE rowid = ?`,
        args: [next, Number(row.rid)],
      })
    }
  }
}

async function tableExists(db: Client, table: string) {
  const result = await db.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [table],
  })
  return result.rows.length > 0
}

export async function transformDatabase(db: Client, input: TransformInput) {
  const capsuleRoot = `${input.dataDir}/capsules`

  await remapColumn(
    db,
    "pills",
    "repo_path",
    "/workspaces",
    input.workspaceRoot
  )
  await remapColumn(
    db,
    "pill_commands",
    "cwd",
    "/workspaces",
    input.workspaceRoot
  )
  await remapColumn(
    db,
    "capsules",
    "source_path",
    "/workspaces",
    input.workspaceRoot
  )
  await remapColumn(db, "capsules", "path", "/data/capsules", capsuleRoot)

  if (await tableExists(db, "pill_runs")) {
    await db.execute({
      sql: `UPDATE pill_runs
            SET status = 'idle', stopped_at = ?, stop_reason = 'migrated',
                app_pid = NULL, tunnel_pid = NULL
            WHERE stopped_at IS NULL`,
      args: [input.now],
    })
  }
  if (await tableExists(db, "runtime_instances")) {
    await db.execute("DELETE FROM runtime_instances")
  }
  if (await tableExists(db, "pills")) {
    await db.execute(
      "UPDATE pills SET status = 'idle' WHERE status IN ('starting', 'running', 'stopping')"
    )
  }
  if (await tableExists(db, "app_settings")) {
    await db.execute(
      "DELETE FROM app_settings WHERE key = 'runtime.cloudflared_bin'"
    )
    if (input.sessionSecret) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('session_secret', ?)",
        args: [input.sessionSecret],
      })
    }
  }
}

export async function countRows(db: Client, table: string) {
  if (!(await tableExists(db, table))) {
    return 0
  }
  const result = await db.execute(`SELECT COUNT(*) AS n FROM ${table}`)
  return Number(result.rows[0]?.n ?? 0)
}
