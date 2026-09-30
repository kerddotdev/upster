import { createClient, type Client, type InValue } from "@libsql/client"

const BATCH_SIZE = 500

function quote(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`
}

async function waitForHealth(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`)
      if (response.ok) {
        return
      }
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error("The temporary libSQL server did not become ready.")
}

export { waitForHealth }

export async function copyDatabase(
  source: Client,
  destination: Client,
  onTable?: (table: string, rows: number) => void
) {
  const schema = await source.execute(
    `SELECT type, name, tbl_name, sql FROM sqlite_master
     WHERE sql IS NOT NULL
       AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%'
     ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, rowid`
  )

  const tables: Array<string> = []
  for (const row of schema.rows) {
    if (row.type === "table") {
      await destination.execute(String(row.sql))
      tables.push(String(row.name))
    }
  }

  for (const table of tables) {
    const info = await source.execute(`PRAGMA table_info(${quote(table)})`)
    const columns = info.rows.map((row) => String(row.name))
    if (columns.length === 0) {
      continue
    }
    const columnList = columns.map(quote).join(", ")
    const insert = `INSERT INTO ${quote(table)} (${columnList}) VALUES (${columns
      .map(() => "?")
      .join(", ")})`

    let lastRowId = 0
    let copied = 0
    for (;;) {
      const page = await source.execute({
        sql: `SELECT rowid AS __rid, ${columnList} FROM ${quote(table)}
              WHERE rowid > ? ORDER BY rowid LIMIT ${BATCH_SIZE}`,
        args: [lastRowId],
      })
      if (page.rows.length === 0) {
        break
      }
      await destination.batch(
        page.rows.map((row) => ({
          sql: insert,
          args: columns.map((column) => row[column] as InValue),
        })),
        "write"
      )
      lastRowId = Number(page.rows[page.rows.length - 1].__rid)
      copied += page.rows.length
    }
    const expected = Number(
      (await source.execute(`SELECT COUNT(*) AS n FROM ${quote(table)}`))
        .rows[0].n
    )
    if (expected !== copied) {
      throw new Error(`Row count mismatch in ${table}: ${copied}/${expected}`)
    }
    onTable?.(table, copied)
  }

  for (const row of schema.rows) {
    if (row.type !== "table") {
      await destination.execute(String(row.sql)).catch(() => undefined)
    }
  }
}

export function openSource(url: string) {
  return createClient({ url })
}

export function openDestination(path: string) {
  return createClient({ url: `file:${path}` })
}
