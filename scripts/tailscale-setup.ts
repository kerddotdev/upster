#!/usr/bin/env bun

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { networkInterfaces } from "node:os"
import { dirname, join, resolve } from "node:path"

const allowedServePorts = new Set([443, 8443, 10000])

type Options = {
  port: number
  servePort: number
  outDir: string
  disable: boolean
}

type CommandResult = {
  status: number
  stdout: string
  stderr: string
}

type TailscaleStatusResponse = {
  BackendState?: string
  Self?: {
    DNSName?: string
    TailscaleIPs?: Array<string>
    Online?: boolean
  }
}

type TailscaleServeStatusResponse = {
  TCP?: unknown
  Web?: unknown
}

type StatusFile = {
  version: 1
  generatedAt: string
  magicDnsName: string
  tailscaleIps: Array<string>
  servePort: number
  appPort: number
  lanIps: Array<string>
}

function parseArgs(argv: Array<string>): Options {
  const options: Options = {
    port: parsePort(process.env.UPSTER_PORT, 3377, "UPSTER_PORT"),
    servePort: 8443,
    outDir: resolve(process.env.UPSTER_TAILSCALE_DIR || "./.tailscale"),
    disable: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const [name, inlineValue] = arg.includes("=")
      ? (arg.split(/=(.*)/s, 2) as [string, string])
      : [arg, undefined]

    if (name === "--help" || name === "-h") {
      printHelp()
      process.exit(0)
    }

    if (name === "--disable") {
      options.disable = true
      continue
    }

    if (name === "--port") {
      options.port = parsePort(
        readFlagValue(argv, index, inlineValue, name),
        3377,
        name
      )
      if (inlineValue === undefined) {
        index += 1
      }
      continue
    }

    if (name === "--serve-port") {
      options.servePort = parsePort(
        readFlagValue(argv, index, inlineValue, name),
        8443,
        name
      )
      if (inlineValue === undefined) {
        index += 1
      }
      continue
    }

    if (name === "--out") {
      options.outDir = resolve(readFlagValue(argv, index, inlineValue, name))
      if (inlineValue === undefined) {
        index += 1
      }
      continue
    }

    fail(`Unknown argument: ${arg}`)
  }

  if (!allowedServePorts.has(options.servePort)) {
    fail("--serve-port must be one of 443, 8443, or 10000.")
  }

  return options
}

function readFlagValue(
  argv: Array<string>,
  index: number,
  inlineValue: string | undefined,
  name: string
) {
  const value = inlineValue ?? argv[index + 1]
  if (!value || value.startsWith("--")) {
    fail(`${name} requires a value.`)
  }
  return value
}

function parsePort(value: string | undefined, fallback: number, label: string) {
  if (!value) {
    return fallback
  }

  const port = Number.parseInt(value, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`${label} must be a TCP port between 1 and 65535.`)
  }
  return port
}

function printHelp() {
  process.stdout.write(`Usage: bun run tailscale:setup -- [options]

Options:
  --port <port>          Upster dashboard port. Defaults to UPSTER_PORT or 3377.
  --serve-port <port>    Tailscale HTTPS serve port. Use 443, 8443, or 10000. Defaults to 8443.
  --out <dir>            Directory for status.json. Defaults to UPSTER_TAILSCALE_DIR or ./.tailscale.
  --disable              Turn off the configured serve port and remove status.json.
`)
}

function resolveTailscaleBin() {
  const envBin = process.env.TAILSCALE_BIN?.trim()
  if (envBin) {
    if (!existsSync(envBin)) {
      fail(`TAILSCALE_BIN points to ${envBin}, but that file does not exist.`)
    }
    return envBin
  }

  const candidates = [
    "/usr/local/bin/tailscale",
    "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
  ]
  const tailscaleBin = candidates.find((candidate) => existsSync(candidate))
  if (!tailscaleBin) {
    fail(
      "Tailscale CLI not found. Install the macOS Tailscale app or set TAILSCALE_BIN."
    )
  }
  return tailscaleBin
}

function runCommand(
  command: string,
  args: Array<string>,
  allowFailure = false
): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    shell: false,
  })

  if (result.error) {
    if (allowFailure) {
      return { status: 1, stdout: "", stderr: String(result.error.message) }
    }
    fail(`${command} failed: ${result.error.message}`)
  }

  const status = result.status ?? 1
  const stdout = result.stdout ?? ""
  const stderr = result.stderr ?? ""

  if (status !== 0 && !allowFailure) {
    fail(
      [`Command failed: ${[command, ...args].join(" ")}`, stderr || stdout]
        .filter(Boolean)
        .join("\n")
    )
  }

  return { status, stdout, stderr }
}

function parseJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    fail(`${label} returned invalid JSON.`)
  }
}

function readTailscaleStatus(tailscaleBin: string) {
  const result = runCommand(tailscaleBin, ["status", "--json"])
  const status = parseJson<TailscaleStatusResponse>(
    result.stdout,
    "tailscale status --json"
  )
  const self = status.Self
  const magicDnsName = self?.DNSName?.replace(/\.$/, "")
  const tailscaleIps = self?.TailscaleIPs?.filter(Boolean) ?? []

  if (
    status.BackendState !== "Running" ||
    !self?.Online ||
    !magicDnsName ||
    !tailscaleIps.length
  ) {
    fail(
      "Tailscale is not running or this machine is not logged in. Open Tailscale, sign in, then rerun this command."
    )
  }

  return { magicDnsName, tailscaleIps }
}

function readServeStatus(tailscaleBin: string) {
  const result = runCommand(tailscaleBin, ["serve", "status", "--json"], true)
  if (result.status !== 0 || !result.stdout.trim()) {
    return null
  }
  return parseJson<TailscaleServeStatusResponse>(
    result.stdout,
    "tailscale serve status --json"
  )
}

function findServePortProxies(
  serveStatus: TailscaleServeStatusResponse | null,
  servePort: number
) {
  if (!serveStatus || !isRecord(serveStatus.Web)) {
    return []
  }

  const suffix = `:${servePort}`
  const proxies: Array<string> = []

  for (const [host, config] of Object.entries(serveStatus.Web)) {
    if (!host.endsWith(suffix) || !isRecord(config)) {
      continue
    }

    const handlers = config.Handlers
    if (!isRecord(handlers)) {
      continue
    }

    for (const handler of Object.values(handlers)) {
      if (!isRecord(handler) || typeof handler.Proxy !== "string") {
        continue
      }
      proxies.push(handler.Proxy)
    }
  }

  return proxies
}

function normalizeProxy(value: string) {
  return value.replace(/\/$/, "")
}

function assertNoServeConflict(
  serveStatus: TailscaleServeStatusResponse | null,
  servePort: number,
  target: string
) {
  const targetProxy = normalizeProxy(target)
  const conflictingProxy = findServePortProxies(serveStatus, servePort).find(
    (proxy) => normalizeProxy(proxy) !== targetProxy
  )

  if (conflictingProxy) {
    fail(
      [
        `Tailscale serve HTTPS port ${servePort} is already forwarding to ${conflictingProxy}.`,
        "Use --serve-port 10000 or disable the existing Tailscale serve rule first.",
      ].join("\n")
    )
  }
}

function collectLanIps() {
  const ips = new Set<string>()

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (
        address.family !== "IPv4" ||
        address.internal ||
        isCgnatIpv4(address.address) ||
        !isPrivateLanIpv4(address.address)
      ) {
        continue
      }
      ips.add(address.address)
    }
  }

  return [...ips].sort(compareIpv4)
}

function isPrivateLanIpv4(ip: string) {
  const parts = ipv4Parts(ip)
  if (!parts) {
    return false
  }

  const [first, second] = parts
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function isCgnatIpv4(ip: string) {
  const parts = ipv4Parts(ip)
  return parts ? parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127 : false
}

function ipv4Parts(ip: string) {
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10))
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null
  }
  return parts as [number, number, number, number]
}

function compareIpv4(a: string, b: string) {
  const left = ipv4Parts(a) ?? [0, 0, 0, 0]
  const right = ipv4Parts(b) ?? [0, 0, 0, 0]

  for (let index = 0; index < 4; index += 1) {
    const diff = left[index] - right[index]
    if (diff !== 0) {
      return diff
    }
  }

  return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

async function writeStatusFile(path: string, status: StatusFile) {
  await mkdir(dirname(path), { recursive: true })
  const tmpPath = `${path}.${process.pid}.tmp`
  await writeFile(tmpPath, `${JSON.stringify(status, null, 2)}\n`, {
    mode: 0o644,
  })
  await rename(tmpPath, path)
}

async function removeStatusFile(path: string) {
  await rm(path, { force: true })
}

function printNextSteps(status: StatusFile, outDir: string) {
  const origin = `https://${status.magicDnsName}:${status.servePort}`

  process.stdout.write(
    [
      "Tailscale serve configured.",
      `URL: ${origin}`,
      `Status file: ${join(outDir, "status.json")}`,
      "",
      "Add these lines to .env:",
      `UPSTER_ALLOWED_HOSTS=${status.magicDnsName}`,
      `UPSTER_ALLOWED_ORIGINS=${origin}`,
      "UPSTER_TRUST_PROXY=true",
      `UPSTER_TAILSCALE_DIR=${outDir}`,
      "",
      "Then run:",
      "docker compose up -d",
      "",
    ].join("\n")
  )
}

function disableServe(tailscaleBin: string, servePort: number) {
  const result = runCommand(
    tailscaleBin,
    ["serve", `--https=${servePort}`, "off"],
    true
  )

  if (
    result.status !== 0 &&
    !result.stderr.includes("handler does not exist")
  ) {
    fail(
      [
        `Command failed: ${tailscaleBin} serve --https=${servePort} off`,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n")
    )
  }
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const tailscaleBin = resolveTailscaleBin()
  const statusPath = join(options.outDir, "status.json")

  if (options.disable) {
    disableServe(tailscaleBin, options.servePort)
    await removeStatusFile(statusPath)
    process.stdout.write(
      `Tailscale serve disabled for HTTPS port ${options.servePort}.\n`
    )
    return
  }

  const tailscaleStatus = readTailscaleStatus(tailscaleBin)
  const target = `http://127.0.0.1:${options.port}`
  const serveStatus = readServeStatus(tailscaleBin)

  assertNoServeConflict(serveStatus, options.servePort, target)
  runCommand(tailscaleBin, [
    "serve",
    "--bg",
    `--https=${options.servePort}`,
    target,
  ])

  const status: StatusFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    magicDnsName: tailscaleStatus.magicDnsName,
    tailscaleIps: tailscaleStatus.tailscaleIps,
    servePort: options.servePort,
    appPort: options.port,
    lanIps: collectLanIps(),
  }

  await writeStatusFile(statusPath, status)
  printNextSteps(status, options.outDir)
}

void main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})
