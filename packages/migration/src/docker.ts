import { execFile } from "node:child_process"
import { promisify } from "node:util"

import type { DockerInstance } from "@upster/core"

const execFileAsync = promisify(execFile)

export type DockerRun = (args: Array<string>) => Promise<string>

export const runDocker: DockerRun = async (args) => {
  const { stdout } = await execFileAsync("docker", args, {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  })
  return stdout
}

const DEFAULT_SQLD_IMAGE = "ghcr.io/tursodatabase/libsql-server:latest"
const PROJECT_LABEL = "com.docker.compose.project"
const SERVICE_LABEL = "com.docker.compose.service"

type ContainerRow = {
  id: string
  state: string
  image: string
  service: string
}

export function parseContainerRows(output: string): Array<ContainerRow> {
  return output
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((cols) => cols.length >= 4 && cols[0])
    .map(([id, state, image, service]) => ({ id, state, image, service }))
}

export function findWorkspaceMount(mountsJson: string) {
  try {
    const mounts = JSON.parse(mountsJson) as Array<{
      Destination?: string
      Source?: string
      Type?: string
    }>
    const mount = mounts.find((entry) => entry.Destination === "/workspaces")
    return mount?.Source ?? null
  } catch {
    return null
  }
}

export function findProjects(volumeNames: Array<string>) {
  const names = new Set(volumeNames)
  return volumeNames
    .map((name) => /^(.+)_upster_db$/.exec(name)?.[1])
    .filter((project): project is string => Boolean(project))
    .filter((project) => names.has(`${project}_upster_data`))
}

export async function detectInstances(
  run: DockerRun = runDocker
): Promise<{ dockerAvailable: boolean; instances: Array<DockerInstance> }> {
  try {
    await run(["version", "--format", "{{.Server.Version}}"])
  } catch {
    return { dockerAvailable: false, instances: [] }
  }

  const volumes = (await run(["volume", "ls", "--format", "{{.Name}}"]))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const instances: Array<DockerInstance> = []
  for (const project of findProjects(volumes)) {
    const rows = parseContainerRows(
      await run([
        "ps",
        "-a",
        "--filter",
        `label=${PROJECT_LABEL}=${project}`,
        "--format",
        `{{.ID}}\t{{.State}}\t{{.Image}}\t{{.Label "${SERVICE_LABEL}"}}`,
      ])
    )
    const appRow = rows.find((row) => row.service === "upster")
    const dbRow = rows.find((row) => row.service === "db")
    const workspaceRoot = appRow
      ? findWorkspaceMount(
          await run(["inspect", appRow.id, "--format", "{{json .Mounts}}"])
        )
      : null

    instances.push({
      project,
      dbVolume: `${project}_upster_db`,
      dataVolume: `${project}_upster_data`,
      workspaceRoot,
      sqldImage: dbRow?.image ?? DEFAULT_SQLD_IMAGE,
      running: rows.some((row) => row.state === "running"),
      containerIds: rows.map((row) => row.id),
    })
  }

  return { dockerAvailable: true, instances }
}

export async function stopContainers(
  instance: DockerInstance,
  run: DockerRun = runDocker
) {
  const running = (
    await run([
      "ps",
      "--filter",
      `label=${PROJECT_LABEL}=${instance.project}`,
      "--format",
      "{{.ID}}",
    ])
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  if (running.length > 0) {
    await run(["stop", ...running])
  }
}

export async function readSessionSecretEnv(
  instance: DockerInstance,
  run: DockerRun = runDocker
) {
  const rows = parseContainerRows(
    await run([
      "ps",
      "-a",
      "--filter",
      `label=${PROJECT_LABEL}=${instance.project}`,
      "--format",
      `{{.ID}}\t{{.State}}\t{{.Image}}\t{{.Label "${SERVICE_LABEL}"}}`,
    ])
  )
  const app = rows.find((row) => row.service === "upster")
  if (!app) {
    return null
  }
  const env = JSON.parse(
    await run(["inspect", app.id, "--format", "{{json .Config.Env}}"])
  ) as Array<string>
  const entry = env.find((line) => line.startsWith("UPSTER_SESSION_SECRET="))
  const value = entry?.slice("UPSTER_SESSION_SECRET=".length)
  return value ? value : null
}

export async function copyFromVolume(input: {
  volume: string
  containerPath: string
  image: string
  destination: string
  name: string
  run?: DockerRun
}) {
  const run = input.run ?? runDocker
  const id = (
    await run([
      "create",
      "--name",
      input.name,
      "-v",
      `${input.volume}:/vol:ro`,
      input.image,
    ])
  ).trim()
  try {
    await run(["cp", `${id}:/vol/${input.containerPath}`, input.destination])
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/could not find|no such/i.test(message)) {
      return false
    }
    throw error
  } finally {
    await run(["rm", "-f", id]).catch(() => undefined)
  }
}
