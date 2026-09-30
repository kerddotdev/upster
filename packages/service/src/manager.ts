import { execFile } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"

import {
  isDevFlavor,
  readRuntimeState,
  serviceLogPath,
  type RuntimeState,
} from "@upster/core/node"

import {
  renderLaunchAgentPlist,
  renderSystemdUnit,
  type ServiceDefinition,
} from "./render"

const execFileAsync = promisify(execFile)

export function serviceLabel(env: NodeJS.ProcessEnv = process.env) {
  return isDevFlavor(env)
    ? "com.kerdofficial.upster.dev"
    : "com.kerdofficial.upster"
}

export function systemdUnit(env: NodeJS.ProcessEnv = process.env) {
  return isDevFlavor(env) ? "upster-dev.service" : "upster.service"
}

export type ServiceInstallInput = {
  nodePath: string
  entryPath: string
  dataDir: string
  port: number
  workspaceRoots: Array<string>
  extraEnv?: Record<string, string>
}

export type ServiceStatus = {
  supported: boolean
  installed: boolean
  running: RuntimeState | null
}

export type RunCommand = (
  file: string,
  args: Array<string>
) => Promise<{ stdout: string }>

const defaultRun: RunCommand = async (file, args) => {
  const { stdout } = await execFileAsync(file, args, { encoding: "utf-8" })
  return { stdout }
}

export function servicePlatform(platform = process.platform) {
  return platform === "darwin" || platform === "linux" ? platform : null
}

export function launchAgentPath(home = homedir()) {
  return join(home, "Library", "LaunchAgents", `${serviceLabel()}.plist`)
}

export function systemdUnitPath(home = homedir()) {
  return join(home, ".config", "systemd", "user", systemdUnit())
}

export async function resolveLoginShellPath(
  run: RunCommand = defaultRun,
  env: NodeJS.ProcessEnv = process.env
) {
  const fallback = env.PATH ?? "/usr/local/bin:/usr/bin:/bin"
  const shell = env.SHELL
  if (!shell) {
    return fallback
  }

  try {
    const { stdout } = await run(shell, ["-ilc", 'printf %s "$PATH"'])
    const path = stdout.trim().split("\n").at(-1)?.trim()
    return path || fallback
  } catch {
    return fallback
  }
}

export function buildServiceDefinition(
  input: ServiceInstallInput,
  path: string
): ServiceDefinition {
  return {
    label: serviceLabel(),
    program: [input.nodePath, input.entryPath],
    logPath: serviceLogPath(input.dataDir),
    env: {
      PATH: path,
      HOME: homedir(),
      UPSTER_DATA_DIR: input.dataDir,
      UPSTER_PORT: String(input.port),
      UPSTER_WORKSPACE_ROOTS: input.workspaceRoots.join(","),
      NODE_ENV: "production",
      UPSTER_TRUST_PROXY: "true",
      ...input.extraEnv,
    },
  }
}

function uid() {
  const id = process.getuid?.()
  if (id === undefined) {
    throw new Error("The Upster service needs a POSIX user.")
  }
  if (id === 0) {
    throw new Error("Refusing to install the Upster service as root.")
  }
  return id
}

export async function installService(
  input: ServiceInstallInput,
  run: RunCommand = defaultRun
) {
  const platform = servicePlatform()
  if (!platform) {
    throw new Error("Native service is supported on macOS and Linux only.")
  }

  mkdirSync(input.dataDir, { recursive: true, mode: 0o700 })
  const definition = buildServiceDefinition(
    input,
    await resolveLoginShellPath(run)
  )

  if (platform === "darwin") {
    const path = launchAgentPath()
    mkdirSync(dirname(path), { recursive: true })
    const domain = `gui/${uid()}`
    await run("launchctl", ["bootout", `${domain}/${serviceLabel()}`]).catch(
      () => undefined
    )
    writeFileSync(path, renderLaunchAgentPlist(definition), { mode: 0o600 })
    await run("launchctl", ["bootstrap", domain, path])
    await run("launchctl", ["kickstart", "-k", `${domain}/${serviceLabel()}`])
    return
  }

  const path = systemdUnitPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, renderSystemdUnit(definition), { mode: 0o600 })
  await run("systemctl", ["--user", "daemon-reload"])
  await run("systemctl", ["--user", "enable", "--now", systemdUnit()])
}

export async function uninstallService(run: RunCommand = defaultRun) {
  const platform = servicePlatform()
  if (platform === "darwin") {
    await run("launchctl", ["bootout", `gui/${uid()}/${serviceLabel()}`]).catch(
      () => undefined
    )
    rmSync(launchAgentPath(), { force: true })
  } else if (platform === "linux") {
    await run("systemctl", ["--user", "disable", "--now", systemdUnit()]).catch(
      () => undefined
    )
    rmSync(systemdUnitPath(), { force: true })
    await run("systemctl", ["--user", "daemon-reload"]).catch(() => undefined)
  }
}

export async function controlService(
  action: "start" | "stop" | "restart",
  run: RunCommand = defaultRun
) {
  const platform = servicePlatform()
  if (platform === "darwin") {
    const target = `gui/${uid()}/${serviceLabel()}`
    if (action === "stop") {
      await run("launchctl", ["kill", "SIGTERM", target])
    } else {
      await run("launchctl", [
        "kickstart",
        ...(action === "restart" ? ["-k"] : []),
        target,
      ])
    }
  } else if (platform === "linux") {
    await run("systemctl", ["--user", action, systemdUnit()])
  } else {
    throw new Error("Native service is supported on macOS and Linux only.")
  }
}

export async function serviceStatus(
  dataDir: string,
  exists: (path: string) => boolean
): Promise<ServiceStatus> {
  const platform = servicePlatform()
  if (!platform) {
    return { supported: false, installed: false, running: null }
  }

  const unit = platform === "darwin" ? launchAgentPath() : systemdUnitPath()
  return {
    supported: true,
    installed: exists(unit),
    running: readRuntimeState(dataDir),
  }
}

export type BundleInstallInput = {
  bundleDir: string
  dataDir: string
  port: number
  workspaceRoots: Array<string>
}

export function stagedBundleDir(dataDir: string) {
  return join(dataDir, "bundle")
}

export function readBundleVersion(bundleDir: string) {
  try {
    const manifest = JSON.parse(
      readFileSync(join(bundleDir, "manifest.json"), "utf-8")
    ) as { version?: string }
    return manifest.version ?? null
  } catch {
    return null
  }
}

export function readBundleIdentity(bundleDir: string) {
  try {
    const manifest = JSON.parse(
      readFileSync(join(bundleDir, "manifest.json"), "utf-8")
    ) as { version?: string; buildId?: string }
    return `${manifest.version ?? ""}+${manifest.buildId ?? ""}`
  } catch {
    return null
  }
}

export async function installFromBundle(
  input: BundleInstallInput,
  run: RunCommand = defaultRun
) {
  for (const path of [
    join(input.bundleDir, "runtime", "node"),
    join(input.bundleDir, "app", "server.mjs"),
  ]) {
    if (!existsSync(path)) {
      throw new Error(`Not an Upster server bundle, missing ${path}`)
    }
  }

  const staged = stagedBundleDir(input.dataDir)
  if (staged !== input.bundleDir) {
    await controlService("stop", run).catch(() => undefined)
    mkdirSync(input.dataDir, { recursive: true, mode: 0o700 })
    rmSync(staged, { recursive: true, force: true })
    cpSync(input.bundleDir, staged, { recursive: true, verbatimSymlinks: true })
  }

  writeFileSync(
    join(input.dataDir, "service.json"),
    JSON.stringify({ port: input.port, workspaceRoots: input.workspaceRoots }),
    { mode: 0o600 }
  )

  const cloudflaredPath = join(staged, "runtime", "cloudflared")
  const version = readBundleVersion(staged)

  await installService(
    {
      nodePath: join(staged, "runtime", "node"),
      entryPath: join(staged, "app", "server.mjs"),
      dataDir: input.dataDir,
      port: input.port,
      workspaceRoots: input.workspaceRoots,
      extraEnv: {
        ...(existsSync(cloudflaredPath)
          ? { CLOUDFLARED_BIN: cloudflaredPath }
          : {}),
        ...(version ? { UPSTER_VERSION: version } : {}),
      },
    },
    run
  )
}

export function readInstalledConfig(dataDir: string) {
  try {
    const config = JSON.parse(
      readFileSync(join(dataDir, "service.json"), "utf-8")
    ) as Partial<Pick<BundleInstallInput, "port" | "workspaceRoots">>
    if (
      typeof config.port === "number" &&
      Array.isArray(config.workspaceRoots)
    ) {
      return { port: config.port, workspaceRoots: config.workspaceRoots }
    }
  } catch {
    return null
  }
  return null
}
