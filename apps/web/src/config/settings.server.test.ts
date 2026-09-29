import { afterEach, describe, expect, it } from "vitest"

import {
  getAppPortRange,
  getCapsuleRetention,
  getCloudflaredBin,
  getMetricsPortRange,
} from "@/config/settings.server"

const ENV_KEYS = [
  "UPSTER_APP_PORT_RANGE",
  "UPSTER_METRICS_PORT_RANGE",
  "UPSTER_CAPSULE_RETENTION",
  "CLOUDFLARED_BIN",
]

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
})

describe("runtime settings env override", () => {
  it("uses the env value when set", async () => {
    process.env.UPSTER_APP_PORT_RANGE = "10000-20000"
    process.env.CLOUDFLARED_BIN = "/opt/cloudflared"

    await expect(getAppPortRange()).resolves.toEqual({
      min: 10000,
      max: 20000,
    })
    await expect(getCloudflaredBin()).resolves.toBe("/opt/cloudflared")
  })

  it("falls back to the default when the env value is malformed", async () => {
    process.env.UPSTER_METRICS_PORT_RANGE = "not-a-range"

    await expect(getMetricsPortRange()).resolves.toEqual({
      min: 52000,
      max: 60999,
    })
  })

  it("parses capsule retention and rejects invalid values", async () => {
    process.env.UPSTER_CAPSULE_RETENTION = "3"
    await expect(getCapsuleRetention()).resolves.toBe(3)

    process.env.UPSTER_CAPSULE_RETENTION = "-1"
    await expect(getCapsuleRetention()).resolves.toBe(10)
  })
})
