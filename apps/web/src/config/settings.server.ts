import { getAppSetting, setAppSetting } from "@/db/repositories.server"
import type { PortRange } from "@/config/env.server"

type RuntimeField =
  | "appPortRange"
  | "metricsPortRange"
  | "publicOrigin"
  | "capsuleRetention"
  | "cloudflaredBin"

const SETTING_KEY: Record<RuntimeField, string> = {
  appPortRange: "runtime.app_port_range",
  metricsPortRange: "runtime.metrics_port_range",
  publicOrigin: "runtime.public_origin",
  capsuleRetention: "runtime.capsule_retention",
  cloudflaredBin: "runtime.cloudflared_bin",
}

const ENV_KEY: Record<RuntimeField, string> = {
  appPortRange: "UPSTER_APP_PORT_RANGE",
  metricsPortRange: "UPSTER_METRICS_PORT_RANGE",
  publicOrigin: "UPSTER_PUBLIC_ORIGIN",
  capsuleRetention: "UPSTER_CAPSULE_RETENTION",
  cloudflaredBin: "CLOUDFLARED_BIN",
}

const DEFAULTS: Record<RuntimeField, string> = {
  appPortRange: "41000-49151",
  metricsPortRange: "52000-60999",
  publicOrigin: "https://localhost:3377",
  capsuleRetention: "10",
  cloudflaredBin: "cloudflared",
}

const dbCache = new Map<RuntimeField, string | null>()

function envValue(field: RuntimeField) {
  const value = process.env[ENV_KEY[field]]?.trim()
  return value ? value : null
}

async function resolveRaw(field: RuntimeField) {
  const fromEnv = envValue(field)
  if (fromEnv) {
    return fromEnv
  }

  if (!dbCache.has(field)) {
    dbCache.set(field, await getAppSetting(SETTING_KEY[field]))
  }

  return dbCache.get(field) ?? DEFAULTS[field]
}

function parsePortRange(value: string, fallback: PortRange): PortRange {
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

function assertValidPortRange(value: string) {
  const [minRaw, maxRaw] = value.split("-")
  const min = Number(minRaw)
  const max = Number(maxRaw)

  if (
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min <= 0 ||
    max > 65535 ||
    max < min
  ) {
    throw new Error("Port range must be MIN-MAX with 1 <= MIN <= MAX <= 65535.")
  }
}

export async function getAppPortRange(): Promise<PortRange> {
  return parsePortRange(await resolveRaw("appPortRange"), {
    min: 41000,
    max: 49151,
  })
}

export async function getMetricsPortRange(): Promise<PortRange> {
  return parsePortRange(await resolveRaw("metricsPortRange"), {
    min: 52000,
    max: 60999,
  })
}

export async function getPublicOrigin(): Promise<string> {
  return await resolveRaw("publicOrigin")
}

export async function getCapsuleRetention(): Promise<number> {
  const parsed = Number(await resolveRaw("capsuleRetention"))
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 10
}

export async function getCloudflaredBin(): Promise<string> {
  return await resolveRaw("cloudflaredBin")
}

export type RuntimeSettingsView = {
  appPortRange: string
  metricsPortRange: string
  publicOrigin: string
  capsuleRetention: string
  cloudflaredBin: string
  envManaged: Record<RuntimeField, boolean>
}

export async function getRuntimeSettingsView(): Promise<RuntimeSettingsView> {
  const fields: Array<RuntimeField> = [
    "appPortRange",
    "metricsPortRange",
    "publicOrigin",
    "capsuleRetention",
    "cloudflaredBin",
  ]

  const envManaged = {} as Record<RuntimeField, boolean>
  const values = {} as Record<RuntimeField, string>

  for (const field of fields) {
    envManaged[field] = Boolean(envValue(field))
    values[field] = await resolveRaw(field)
  }

  return {
    appPortRange: values.appPortRange,
    metricsPortRange: values.metricsPortRange,
    publicOrigin: values.publicOrigin,
    capsuleRetention: values.capsuleRetention,
    cloudflaredBin: values.cloudflaredBin,
    envManaged,
  }
}

export type RuntimeSettingsPatch = Partial<{
  appPortRange: string
  metricsPortRange: string
  publicOrigin: string
  capsuleRetention: string
}>

async function writeSetting(field: RuntimeField, value: string) {
  if (envValue(field)) {
    throw new Error(
      `${ENV_KEY[field]} is set as an environment variable and cannot be edited here.`
    )
  }

  await setAppSetting(SETTING_KEY[field], value)
  dbCache.set(field, value)
}

export async function updateRuntimeSettings(patch: RuntimeSettingsPatch) {
  if (patch.appPortRange !== undefined) {
    assertValidPortRange(patch.appPortRange.trim())
    await writeSetting("appPortRange", patch.appPortRange.trim())
  }

  if (patch.metricsPortRange !== undefined) {
    assertValidPortRange(patch.metricsPortRange.trim())
    await writeSetting("metricsPortRange", patch.metricsPortRange.trim())
  }

  if (patch.publicOrigin !== undefined) {
    const value = patch.publicOrigin.trim()
    if (!value) {
      throw new Error("Public origin cannot be empty.")
    }
    await writeSetting("publicOrigin", value)
  }

  if (patch.capsuleRetention !== undefined) {
    const parsed = Number(patch.capsuleRetention.trim())
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error("Capsule retention must be a non-negative integer.")
    }
    await writeSetting("capsuleRetention", String(parsed))
  }
}

export async function updateCloudflaredBin(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error("cloudflared binary path cannot be empty.")
  }
  await writeSetting("cloudflaredBin", trimmed)
}
