import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"

import type {
  DockerDetection,
  DockerInstance,
  MigrationEvent,
  MigrationSummary,
} from "@upster/core"

import {
  copyFromVolume,
  detectInstances,
  readSessionSecretEnv,
  runDocker,
  stopContainers,
  type DockerRun,
} from "./docker"
import {
  copyDatabase,
  openDestination,
  openSource,
  waitForHealth,
} from "./export-db"
import { countRows, transformDatabase } from "./transform"

export type MigrationRunInput = {
  dataDir: string
  project: string
  workspaceRoot: string | null
  stopContainers: boolean
  emit: (event: MigrationEvent) => void
  run?: DockerRun
}

export function nativeHasData(dataDir: string) {
  try {
    return statSync(join(dataDir, "upster.db")).size > 0
  } catch {
    return false
  }
}

export async function detect(dataDir: string): Promise<DockerDetection> {
  const { dockerAvailable, instances } = await detectInstances()
  return { dockerAvailable, instances, nativeHasData: nativeHasData(dataDir) }
}

function findInstance(
  instances: Array<DockerInstance>,
  project: string
): DockerInstance {
  const instance = instances.find((entry) => entry.project === project)
  if (!instance) {
    throw new Error(`No Upster Docker data found for project "${project}".`)
  }
  return instance
}

async function exportFromSqld(
  run: DockerRun,
  instance: DockerInstance,
  workDir: string,
  destinationPath: string,
  onTable: (table: string, rows: number) => void
) {
  const suffix = randomBytes(4).toString("hex")
  const sqldDir = join(workDir, "sqld")
  mkdirSync(sqldDir, { recursive: true })

  const found = await copyFromVolume({
    volume: instance.dbVolume,
    containerPath: ".",
    image: instance.sqldImage,
    destination: sqldDir,
    name: `upster-migrate-db-${suffix}`,
    run,
  })
  if (!found) {
    throw new Error("The Docker database volume is empty.")
  }

  const name = `upster-migrate-sqld-${suffix}`
  await run([
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    "-e",
    "SQLD_NODE=primary",
    "-p",
    "127.0.0.1::8080",
    "-v",
    `${sqldDir}:/var/lib/sqld`,
    instance.sqldImage,
  ])

  try {
    const mapping = (await run(["port", name, "8080/tcp"])).split("\n")[0]
    const port = Number(mapping.split(":").at(-1))
    if (!Number.isInteger(port)) {
      throw new Error("Could not determine the temporary libSQL port.")
    }
    const url = `http://127.0.0.1:${port}`
    await waitForHealth(url, 60_000)

    const source = openSource(url)
    const destination = openDestination(destinationPath)
    try {
      await copyDatabase(source, destination, onTable)
    } finally {
      source.close()
      destination.close()
    }
  } finally {
    await run(["stop", "-t", "2", name]).catch(() => undefined)
  }
}

export async function migrate(
  input: MigrationRunInput
): Promise<MigrationSummary> {
  const run = input.run ?? runDocker
  const { instances } = await detectInstances(run)
  const instance = findInstance(instances, input.project)
  const workspaceRoot = input.workspaceRoot ?? instance.workspaceRoot
  if (!workspaceRoot) {
    throw new Error(
      "Choose the folder that was mounted as /workspaces in Docker."
    )
  }

  const suffix = randomBytes(4).toString("hex")
  const workDir = join(input.dataDir, `migration-${suffix}`)
  mkdirSync(workDir, { recursive: true, mode: 0o700 })

  try {
    if (instance.running) {
      if (!input.stopContainers) {
        throw new Error(
          "The Upster Docker containers are still running. Stop them first."
        )
      }
      input.emit({
        type: "step",
        id: "stop",
        label: "Stopping Docker containers",
      })
      await stopContainers(instance, run)
    }

    input.emit({
      type: "step",
      id: "export",
      label: "Reading the Docker database",
    })
    const dbPath = join(workDir, "upster.db")
    await exportFromSqld(run, instance, workDir, dbPath, () => undefined)

    input.emit({
      type: "step",
      id: "transform",
      label: "Adapting paths for this computer",
    })
    const db = openDestination(dbPath)
    let summary: MigrationSummary
    try {
      await transformDatabase(db, {
        workspaceRoot,
        dataDir: input.dataDir,
        sessionSecret: await readSessionSecretEnv(instance, run),
        now: new Date().toISOString(),
      })

      input.emit({ type: "step", id: "verify", label: "Verifying the copy" })
      const integrity = await db.execute("PRAGMA integrity_check")
      if (String(integrity.rows[0]?.integrity_check) !== "ok") {
        throw new Error("The migrated database failed its integrity check.")
      }
      await db.execute("PRAGMA wal_checkpoint(TRUNCATE)")

      summary = {
        pills: await countRows(db, "pills"),
        capsules: await countRows(db, "capsules"),
        runs: await countRows(db, "pill_runs"),
        logLines: await countRows(db, "run_logs"),
        workspaceRoot,
        backupPath: null,
      }
    } finally {
      db.close()
    }

    input.emit({ type: "step", id: "capsules", label: "Copying capsules" })
    const capsulesDir = join(workDir, "capsules")
    mkdirSync(capsulesDir, { recursive: true })
    await copyFromVolume({
      volume: instance.dataVolume,
      containerPath: "capsules/.",
      image: instance.sqldImage,
      destination: capsulesDir,
      name: `upster-migrate-data-${suffix}`,
      run,
    })

    input.emit({
      type: "step",
      id: "finalize",
      label: "Installing migrated data",
    })
    const target = join(input.dataDir, "upster.db")
    if (nativeHasData(input.dataDir)) {
      summary.backupPath = `${target}.pre-migration`
      rmSync(summary.backupPath, { force: true })
      renameSync(target, summary.backupPath)
    }
    rmSync(`${target}-wal`, { force: true })
    rmSync(`${target}-shm`, { force: true })
    renameSync(dbPath, target)

    const capsulesTarget = join(input.dataDir, "capsules")
    if (existsSync(capsulesTarget)) {
      rmSync(`${capsulesTarget}.pre-migration`, {
        recursive: true,
        force: true,
      })
      renameSync(capsulesTarget, `${capsulesTarget}.pre-migration`)
    }
    renameSync(capsulesDir, capsulesTarget)

    return summary
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}
