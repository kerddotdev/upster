import { spawn } from "node:child_process"
import { readdirSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, isAbsolute, join, resolve, sep } from "node:path"

import type {
  DockerDetection,
  MigrationEvent,
  MigrationOptions,
  MigrationSummary,
} from "@upster/core"
import { resolveLoginShellPath } from "@upster/service"

import { dataDir } from "./paths"

const EXTRA_PATHS = ["/usr/local/bin", "/opt/homebrew/bin"]

async function migrationEnv() {
  const path = await resolveLoginShellPath()
  const parts = path.split(delimiter)
  for (const extra of EXTRA_PATHS) {
    if (!parts.includes(extra)) {
      parts.push(extra)
    }
  }
  return {
    ...process.env,
    PATH: parts.join(delimiter),
    ELECTRON_RUN_AS_NODE: "",
  }
}

function runMigrateScript(
  bundleDir: string,
  args: Array<string>,
  onEvent: (event: Record<string, unknown>) => void
) {
  return migrationEnv().then(
    (env) =>
      new Promise<void>((resolvePromise, reject) => {
        const child = spawn(
          join(bundleDir, "runtime", "node"),
          [join(bundleDir, "app", "migrate.mjs"), ...args],
          { env, stdio: ["ignore", "pipe", "pipe"] }
        )
        let buffer = ""
        let stderr = ""
        child.stdout.on("data", (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            try {
              onEvent(JSON.parse(line))
            } catch {
              // ignore non-JSON output
            }
          }
        })
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString()
        })
        child.on("error", reject)
        child.on("close", (code) =>
          code === 0
            ? resolvePromise()
            : reject(
                new Error(
                  stderr.trim().split("\n").at(-1) || "Migration failed."
                )
              )
        )
      })
  )
}

export async function detectDocker(bundleDir: string) {
  let detection: DockerDetection | null = null
  await runMigrateScript(
    bundleDir,
    ["detect", "--data-dir", dataDir()],
    (event) => {
      if (event.type === "detected") {
        detection = event.detection as DockerDetection
      }
    }
  )
  return (
    detection ?? { dockerAvailable: false, instances: [], nativeHasData: false }
  )
}

export async function runMigration(
  bundleDir: string,
  options: MigrationOptions,
  onEvent: (event: MigrationEvent) => void
) {
  let summary: MigrationSummary | null = null
  let failure: string | null = null
  const args = [
    "run",
    "--data-dir",
    dataDir(),
    "--project",
    options.project,
    ...(options.workspaceRoot
      ? ["--workspace-root", options.workspaceRoot]
      : []),
    ...(options.stopContainers ? ["--stop-containers"] : []),
  ]

  try {
    await runMigrateScript(bundleDir, args, (raw) => {
      const event = raw as MigrationEvent
      if (event.type === "result") {
        summary = event.summary
      } else if (event.type === "error") {
        failure = event.message
      }
      onEvent(event)
    })
  } catch (error) {
    throw new Error(
      failure ?? (error instanceof Error ? error.message : String(error))
    )
  }

  if (!summary) {
    throw new Error(failure ?? "The migration finished without a result.")
  }
  return summary as MigrationSummary
}

export function assertSafeDataDir(directory: string, home = homedir()) {
  const target = resolve(directory)
  if (
    !isAbsolute(target) ||
    target === home ||
    target === sep ||
    target.split(sep).filter(Boolean).length < 3
  ) {
    throw new Error(`Refusing to reset unsafe data directory: ${target}`)
  }
  return target
}

export function clearDataDir(directory: string, keep = "desktop") {
  const target = assertSafeDataDir(directory)
  for (const entry of readdirSync(target)) {
    if (entry !== keep) {
      rmSync(join(target, entry), { recursive: true, force: true })
    }
  }
}
