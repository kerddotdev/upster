import { execFile } from "node:child_process"

import { setAllowedOrigins } from "@/features/tailscale/allowed-origins"

const BIN = process.env.TAILSCALE_BIN?.trim() || "tailscale"
const SOCKET = process.env.UPSTER_TAILSCALE_SOCKET?.trim() || null
const TARGET =
  process.env.UPSTER_TAILSCALE_TARGET?.trim() ||
  `http://127.0.0.1:${process.env.UPSTER_PORT?.trim() || "3377"}`

export const SERVE_HTTPS_PORT = 443
export const SERVE_HTTP_PORT = 10000

const COMMAND_TIMEOUT_MS = 4000

type CommandResult = { code: number; stdout: string; stderr: string }

function runTailscale(args: Array<string>): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      BIN,
      [...(SOCKET ? ["--socket", SOCKET] : []), ...args],
      { timeout: COMMAND_TIMEOUT_MS, encoding: "utf-8" },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== "number") {
          resolve({ code: 1, stdout: "", stderr: String(error.message) })
          return
        }

        resolve({
          code: typeof error?.code === "number" ? error.code : 0,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
        })
      }
    )
  })
}

type StatusJson = {
  BackendState?: string
  AuthURL?: string
  Self?: {
    DNSName?: string
    TailscaleIPs?: Array<string>
    Online?: boolean
  }
}

type ServeConfigJson = {
  TCP?: Record<string, { HTTPS?: boolean; HTTP?: boolean }>
  AllowFunnel?: Record<string, boolean>
}

export type TailscaleStatus = {
  available: boolean
  loggedIn: boolean
  backendState: string | null
  magicDnsName: string | null
  tailscaleIps: Array<string>
  serveHttpsActive: boolean
  serveHttpActive: boolean
  funnelActive: boolean
  httpsPort: number
  httpPort: number
}

function normalizeMagicDns(name: string | undefined) {
  const trimmed = name?.replace(/\.$/, "").trim()
  return trimmed ? trimmed : null
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function parseServeConfig(raw: string) {
  const parsed = parseJson<ServeConfigJson>(raw)
  const tcp = parsed?.TCP ?? {}
  const funnel = parsed?.AllowFunnel ?? {}

  return {
    serveHttpsActive: Boolean(tcp[String(SERVE_HTTPS_PORT)]?.HTTPS),
    serveHttpActive: Boolean(tcp[String(SERVE_HTTP_PORT)]?.HTTP),
    funnelActive: Object.values(funnel).some(Boolean),
  }
}

async function readServeConfig() {
  const result = await runTailscale(["serve", "status", "--json"])
  if (result.code !== 0 || !result.stdout.trim()) {
    return {
      serveHttpsActive: false,
      serveHttpActive: false,
      funnelActive: false,
    }
  }

  return parseServeConfig(result.stdout)
}

function computeAllowedOrigins(status: TailscaleStatus) {
  if (!status.magicDnsName) {
    return []
  }

  return [
    originFor("https", status.magicDnsName, status.httpsPort),
    originFor("http", status.magicDnsName, status.httpPort),
  ]
}

function originFor(proto: string, host: string, port: number) {
  const defaultPort = proto === "https" ? 443 : 80
  return port === defaultPort
    ? `${proto}://${host}`
    : `${proto}://${host}:${port}`
}

export async function getTailscaleStatus(): Promise<TailscaleStatus> {
  const result = await runTailscale(["status", "--json"])
  const base: TailscaleStatus = {
    available: false,
    loggedIn: false,
    backendState: null,
    magicDnsName: null,
    tailscaleIps: [],
    serveHttpsActive: false,
    serveHttpActive: false,
    funnelActive: false,
    httpsPort: SERVE_HTTPS_PORT,
    httpPort: SERVE_HTTP_PORT,
  }

  if (result.code !== 0 || !result.stdout.trim()) {
    setAllowedOrigins([])
    return base
  }

  const status = parseJson<StatusJson>(result.stdout)
  if (!status) {
    setAllowedOrigins([])
    return base
  }

  const backendState = status.BackendState ?? null
  const loggedIn = backendState === "Running"
  const serve = loggedIn
    ? await readServeConfig()
    : { serveHttpsActive: false, serveHttpActive: false, funnelActive: false }

  const resolved: TailscaleStatus = {
    ...base,
    available: true,
    loggedIn,
    backendState,
    magicDnsName: normalizeMagicDns(status.Self?.DNSName),
    tailscaleIps: status.Self?.TailscaleIPs?.filter(Boolean) ?? [],
    ...serve,
  }

  setAllowedOrigins(computeAllowedOrigins(resolved))
  return resolved
}

async function readAuthUrl(): Promise<string | null> {
  const result = await runTailscale(["status", "--json"])
  const parsed = parseJson<StatusJson>(result.stdout)
  const url = parsed?.AuthURL?.trim()
  return url ? url : null
}

export async function startTailscaleLogin(): Promise<{
  authUrl: string | null
}> {
  const existing = await readAuthUrl()
  if (existing) {
    return { authUrl: existing }
  }

  const login = await runTailscale(["login"]).catch(() => null)
  const fromStatus = await readAuthUrl()
  if (fromStatus) {
    return { authUrl: fromStatus }
  }

  const match =
    login?.stdout.match(/https:\/\/login\.tailscale\.com\/\S+/) ??
    login?.stderr.match(/https:\/\/login\.tailscale\.com\/\S+/)

  return { authUrl: match ? match[0] : null }
}

export async function enableTailscaleServe(): Promise<TailscaleStatus> {
  await runTailscale(["serve", "--bg", `--https=${SERVE_HTTPS_PORT}`, TARGET])
  await runTailscale(["serve", "--bg", `--http=${SERVE_HTTP_PORT}`, TARGET])
  return getTailscaleStatus()
}

export async function disableTailscaleServe(): Promise<TailscaleStatus> {
  await runTailscale(["serve", `--https=${SERVE_HTTPS_PORT}`, "off"])
  await runTailscale(["serve", `--http=${SERVE_HTTP_PORT}`, "off"])
  return getTailscaleStatus()
}
