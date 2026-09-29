import { mkdirSync } from "node:fs"
import { resolve } from "node:path"

import { defaultDataDir } from "@upster/core/node"

export type PortRange = {
  min: number
  max: number
}

export type UpsterConfig = {
  dataDir: string
  port: number
  databaseUrl: string
  databaseAuthToken: string | null
  hostWorkspaceRoot: string | null
  workspaceRoots: Array<string>
  allowedCommands: Array<string>
  appPortRange: PortRange
  metricsPortRange: PortRange
  publicOrigin: string
  cloudflaredBin: string
  capsuleRetention: number
}

function parseRetention(value: string | undefined) {
  if (value === undefined || value.trim() === "") {
    return 10
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 10
}

function parsePort(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseAllowedCommands(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parsePortRange(value: string | undefined, fallback: PortRange) {
  if (!value) {
    return fallback
  }

  const [minRaw, maxRaw] = value.split("-")
  const min = Number(minRaw)
  const max = Number(maxRaw)

  if (
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min <= 0 ||
    max < min
  ) {
    return fallback
  }

  return { min, max }
}

function parseWorkspaceRoots(value: string | undefined) {
  const roots = (value ?? process.cwd())
    .split(",")
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => resolve(root))

  return roots.length ? roots : [process.cwd()]
}

export function getUpsterConfig(): UpsterConfig {
  const dataDir = resolve(process.env.UPSTER_DATA_DIR || defaultDataDir())
  const hostWorkspaceRoot = process.env.UPSTER_HOST_WORKSPACE?.trim()
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })

  return {
    dataDir,
    port: parsePort(process.env.UPSTER_PORT, 3377),
    databaseUrl:
      process.env.DATABASE_URL ?? `file:${resolve(dataDir, "upster.db")}`,
    databaseAuthToken: process.env.DATABASE_AUTH_TOKEN?.trim() || null,
    hostWorkspaceRoot: hostWorkspaceRoot ? resolve(hostWorkspaceRoot) : null,
    workspaceRoots: parseWorkspaceRoots(process.env.UPSTER_WORKSPACE_ROOTS),
    allowedCommands: parseAllowedCommands(process.env.UPSTER_ALLOWED_COMMANDS),
    appPortRange: parsePortRange(process.env.UPSTER_APP_PORT_RANGE, {
      min: 41000,
      max: 49151,
    }),
    metricsPortRange: parsePortRange(process.env.UPSTER_METRICS_PORT_RANGE, {
      min: 52000,
      max: 60999,
    }),
    publicOrigin: process.env.UPSTER_PUBLIC_ORIGIN ?? "https://localhost:3377",
    cloudflaredBin: process.env.CLOUDFLARED_BIN ?? "cloudflared",
    capsuleRetention: parseRetention(process.env.UPSTER_CAPSULE_RETENTION),
  }
}
