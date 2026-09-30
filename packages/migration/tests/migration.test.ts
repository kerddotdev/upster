import { createClient } from "@libsql/client"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  copyDatabase,
  countRows,
  findProjects,
  findWorkspaceMount,
  parseContainerRows,
  remapPath,
  transformDatabase,
} from "../src"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "upster-migration-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function seed(path: string) {
  const db = createClient({ url: `file:${path}` })
  await db.batch([
    "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT)",
    "CREATE TABLE pills (id TEXT PRIMARY KEY, repo_path TEXT NOT NULL, status TEXT NOT NULL)",
    "CREATE TABLE pill_commands (id TEXT PRIMARY KEY, cwd TEXT NOT NULL)",
    "CREATE TABLE capsules (id TEXT PRIMARY KEY, path TEXT NOT NULL, source_path TEXT NOT NULL)",
    "CREATE TABLE pill_runs (id TEXT PRIMARY KEY, status TEXT NOT NULL, app_pid INTEGER, tunnel_pid INTEGER, stopped_at TEXT, stop_reason TEXT)",
    "CREATE TABLE runtime_instances (id TEXT PRIMARY KEY, pid INTEGER)",
    "CREATE UNIQUE INDEX idx_pill_repo ON pills(repo_path)",
    "INSERT INTO app_settings (key, value) VALUES ('runtime.cloudflared_bin', '/usr/bin/cloudflared'), ('runtime.public_origin', 'https://x')",
    "INSERT INTO pills VALUES ('p1', '/workspaces/apps/a', 'running'), ('p2', '/workspaces', 'idle'), ('p3', '/elsewhere/x', 'idle')",
    "INSERT INTO pill_commands VALUES ('c1', '/workspaces/apps/a/web')",
    "INSERT INTO capsules VALUES ('k1', '/data/capsules/p1/k1/source', '/workspaces/apps/a')",
    "INSERT INTO pill_runs VALUES ('r1', 'running', 10, 11, NULL, NULL), ('r2', 'idle', NULL, NULL, '2026-01-01', 'manual')",
    "INSERT INTO runtime_instances VALUES ('i1', 5)",
  ])
  return db
}

describe("remapPath", () => {
  it("only rewrites whole path prefixes", () => {
    expect(remapPath("/workspaces/a", "/workspaces", "/w")).toBe("/w/a")
    expect(remapPath("/workspaces", "/workspaces", "/w")).toBe("/w")
    expect(remapPath("/workspaces2/a", "/workspaces", "/w")).toBe(
      "/workspaces2/a"
    )
  })
})

describe("transformDatabase", () => {
  it("remaps paths, closes stale runs and resets deployment settings", async () => {
    const db = await seed(join(dir, "a.db"))
    await transformDatabase(db, {
      workspaceRoot: "/Volumes/Dev",
      dataDir: "/native/data",
      sessionSecret: "s3cret-from-env",
      now: "2026-09-30T00:00:00.000Z",
    })

    const pills = await db.execute(
      "SELECT id, repo_path, status FROM pills ORDER BY id"
    )
    expect(pills.rows.map((r) => [r.repo_path, r.status])).toEqual([
      ["/Volumes/Dev/apps/a", "idle"],
      ["/Volumes/Dev", "idle"],
      ["/elsewhere/x", "idle"],
    ])
    expect(
      (await db.execute("SELECT cwd FROM pill_commands")).rows[0].cwd
    ).toBe("/Volumes/Dev/apps/a/web")
    const capsule = (await db.execute("SELECT path, source_path FROM capsules"))
      .rows[0]
    expect(capsule.path).toBe("/native/data/capsules/p1/k1/source")
    expect(capsule.source_path).toBe("/Volumes/Dev/apps/a")

    const runs = await db.execute(
      "SELECT id, status, app_pid, stop_reason FROM pill_runs ORDER BY id"
    )
    expect(runs.rows[0]).toMatchObject({
      status: "idle",
      app_pid: null,
      stop_reason: "migrated",
    })
    expect(runs.rows[1]).toMatchObject({ stop_reason: "manual" })
    expect(await countRows(db, "runtime_instances")).toBe(0)

    const settings = await db.execute(
      "SELECT key, value FROM app_settings ORDER BY key"
    )
    expect(settings.rows.map((r) => r.key)).toEqual([
      "runtime.public_origin",
      "session_secret",
    ])
    db.close()
  })

  it("keeps an existing session secret over the env value", async () => {
    const db = await seed(join(dir, "b.db"))
    await db.execute(
      "INSERT INTO app_settings (key, value) VALUES ('session_secret', 'stored')"
    )
    await transformDatabase(db, {
      workspaceRoot: "/w",
      dataDir: "/d",
      sessionSecret: "env",
      now: "t",
    })
    const row = await db.execute(
      "SELECT value FROM app_settings WHERE key = 'session_secret'"
    )
    expect(row.rows[0].value).toBe("stored")
    db.close()
  })

  it("tolerates databases that lack optional tables and columns", async () => {
    const db = createClient({ url: `file:${join(dir, "old.db")}` })
    await db.execute(
      "CREATE TABLE pills (id TEXT PRIMARY KEY, repo_path TEXT NOT NULL, status TEXT NOT NULL)"
    )
    await db.execute("INSERT INTO pills VALUES ('p', '/workspaces/x', 'idle')")
    await transformDatabase(db, {
      workspaceRoot: "/w",
      dataDir: "/d",
      sessionSecret: null,
      now: "t",
    })
    expect(
      (await db.execute("SELECT repo_path FROM pills")).rows[0].repo_path
    ).toBe("/w/x")
    db.close()
  })
})

describe("copyDatabase", () => {
  it("copies tables, rows and indexes between databases", async () => {
    const source = await seed(join(dir, "src.db"))
    const destination = createClient({ url: `file:${join(dir, "dst.db")}` })
    await copyDatabase(source, destination)

    expect(await countRows(destination, "pills")).toBe(3)
    expect(await countRows(destination, "pill_runs")).toBe(2)
    const index = await destination.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_pill_repo'"
    )
    expect(index.rows).toHaveLength(1)
    source.close()
    destination.close()
  })
})

describe("docker parsing", () => {
  it("pairs db and data volumes into projects", () => {
    expect(
      findProjects([
        "upster_upster_db",
        "upster_upster_data",
        "x_upster_db",
        "other",
      ])
    ).toEqual(["upster"])
  })

  it("parses compose container rows", () => {
    expect(
      parseContainerRows("a1\trunning\timg:1\tupster\nb2\texited\tsqld\tdb\n")
    ).toEqual([
      { id: "a1", state: "running", image: "img:1", service: "upster" },
      { id: "b2", state: "exited", image: "sqld", service: "db" },
    ])
  })

  it("finds the workspaces bind mount source", () => {
    expect(
      findWorkspaceMount(
        JSON.stringify([
          { Destination: "/data", Source: "/var/lib/docker/x" },
          { Destination: "/workspaces", Source: "/Volumes/Dev" },
        ])
      )
    ).toBe("/Volumes/Dev")
    expect(findWorkspaceMount("[]")).toBeNull()
  })
})
