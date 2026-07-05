import { describe, expect, it } from "vitest"

import {
  addCurrentRequestEndpoint,
  buildConnectionEndpoints,
} from "@/features/connections/endpoints.server"
import type { TailscaleStatus } from "@/features/tailscale/tailscale-control.server"

const activeStatus: TailscaleStatus = {
  available: true,
  loggedIn: true,
  backendState: "Running",
  magicDnsName: "host.example.ts.net",
  tailscaleIps: ["100.64.1.2", "fd7a:115c:a1e0::1"],
  serveHttpsActive: true,
  serveHttpActive: true,
  httpsPort: 443,
  httpPort: 10000,
}

const offlineStatus: TailscaleStatus = {
  available: false,
  loggedIn: false,
  backendState: null,
  magicDnsName: null,
  tailscaleIps: [],
  serveHttpsActive: false,
  serveHttpActive: false,
  httpsPort: 443,
  httpPort: 10000,
}

describe("connection endpoints", () => {
  it("builds loopback, tailscale https and tailscale ip when serve is active", () => {
    const endpoints = buildConnectionEndpoints(activeStatus, 3377)

    expect(endpoints.map((endpoint) => endpoint.kind)).toEqual([
      "loopback",
      "tailscale-https",
      "tailscale-ip",
    ])
    expect(endpoints.map((endpoint) => endpoint.origin)).toEqual([
      "http://127.0.0.1:3377",
      "https://host.example.ts.net",
      "http://100.64.1.2:10000",
    ])
    expect(endpoints.every((endpoint) => !endpoint.setupRequired)).toBe(true)
  })

  it("marks tailscale https as setup required when not logged in", () => {
    const endpoints = buildConnectionEndpoints(offlineStatus, 3377)

    expect(endpoints).toMatchObject([
      { kind: "loopback", origin: "http://127.0.0.1:3377" },
      { kind: "tailscale-https", origin: null, setupRequired: true },
    ])
  })

  it("omits the tailscale ip endpoint when http serve is off", () => {
    const endpoints = buildConnectionEndpoints(
      { ...activeStatus, serveHttpActive: false },
      3377
    )

    expect(endpoints.some((endpoint) => endpoint.kind === "tailscale-ip")).toBe(
      false
    )
  })

  it("adds the current request origin when it is not already listed", () => {
    const endpoints = buildConnectionEndpoints(activeStatus, 3377)
    const withCurrent = addCurrentRequestEndpoint(
      endpoints,
      "https://current.example"
    )
    const deduped = addCurrentRequestEndpoint(
      endpoints,
      "https://host.example.ts.net"
    )

    expect(withCurrent.at(-1)).toMatchObject({
      kind: "current",
      current: true,
      origin: "https://current.example",
    })
    expect(deduped).toBe(endpoints)
  })
})
