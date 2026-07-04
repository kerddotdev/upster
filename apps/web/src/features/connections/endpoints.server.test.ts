import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  addCurrentRequestEndpoint,
  buildConnectionEndpoints,
  readTailscaleStatusFile,
  type TailscaleStatus,
} from "@/features/connections/endpoints.server"

const freshStatus: TailscaleStatus = {
  version: 1,
  generatedAt: new Date().toISOString(),
  magicDnsName: "host.example.ts.net",
  tailscaleIps: ["100.64.1.2", "fd7a:115c:a1e0::1"],
  servePort: 8443,
  appPort: 3377,
  lanIps: ["192.168.1.10"],
}

describe("tailscale endpoint discovery", () => {
  it("returns null for missing or invalid status files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upster-tailscale-"))
    const invalidPath = join(dir, "status.json")

    try {
      writeFileSync(invalidPath, JSON.stringify({ version: 2 }))

      await expect(readTailscaleStatusFile(join(dir, "missing.json")))
        .resolves.toBeNull()
      await expect(readTailscaleStatusFile(invalidPath)).resolves.toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("parses valid status files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upster-tailscale-"))
    const statusPath = join(dir, "status.json")

    try {
      writeFileSync(statusPath, JSON.stringify(freshStatus))

      await expect(readTailscaleStatusFile(statusPath)).resolves.toEqual(
        freshStatus
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("builds endpoints in the expected order with bind flags", () => {
    const endpoints = buildConnectionEndpoints(freshStatus, 3377)

    expect(endpoints.map((endpoint) => endpoint.kind)).toEqual([
      "loopback",
      "lan",
      "tailscale-ip",
      "tailscale-https",
    ])
    expect(endpoints.map((endpoint) => endpoint.origin)).toEqual([
      "http://127.0.0.1:3377",
      "http://192.168.1.10:3377",
      "http://100.64.1.2:3377",
      "https://host.example.ts.net:8443",
    ])
    expect(endpoints[1]?.requiresBindHost).toBe(true)
    expect(endpoints[2]?.requiresBindHost).toBe(true)
    expect(endpoints[3]?.requiresBindHost).toBe(false)
  })

  it("marks stale status files", () => {
    const endpoints = buildConnectionEndpoints(
      {
        ...freshStatus,
        generatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      },
      3377
    )

    expect(endpoints.every((endpoint) => endpoint.stale)).toBe(true)
  })

  it("returns setup required HTTPS endpoint without a status file", () => {
    const endpoints = buildConnectionEndpoints(null, 3377)

    expect(endpoints).toMatchObject([
      {
        kind: "loopback",
        origin: "http://127.0.0.1:3377",
        setupRequired: false,
      },
      {
        kind: "tailscale-https",
        origin: null,
        setupRequired: true,
      },
    ])
  })

  it("adds the current request origin when it is not already listed", () => {
    const endpoints = buildConnectionEndpoints(freshStatus, 3377)
    const withCurrent = addCurrentRequestEndpoint(
      endpoints,
      "https://current.example"
    )
    const deduped = addCurrentRequestEndpoint(
      endpoints,
      "https://host.example.ts.net:8443"
    )

    expect(withCurrent.at(-1)).toMatchObject({
      kind: "current",
      current: true,
      origin: "https://current.example",
    })
    expect(deduped).toBe(endpoints)
  })
})
