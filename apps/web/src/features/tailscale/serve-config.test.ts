import { describe, expect, it } from "vitest"

import { parseServeConfig } from "@/features/tailscale/tailscale-control.server"

describe("parseServeConfig", () => {
  it("detects active https and http serve", () => {
    const parsed = parseServeConfig(
      JSON.stringify({
        TCP: { "443": { HTTPS: true }, "10000": { HTTP: true } },
      })
    )

    expect(parsed.serveHttpsActive).toBe(true)
    expect(parsed.serveHttpActive).toBe(true)
    expect(parsed.funnelActive).toBe(false)
  })

  it("flags funnel when any AllowFunnel entry is true", () => {
    const parsed = parseServeConfig(
      JSON.stringify({
        TCP: { "443": { HTTPS: true } },
        AllowFunnel: { "host.example.ts.net:443": true },
      })
    )

    expect(parsed.funnelActive).toBe(true)
  })

  it("does not flag funnel when AllowFunnel entries are false or missing", () => {
    expect(
      parseServeConfig(
        JSON.stringify({ AllowFunnel: { "host.example.ts.net:443": false } })
      ).funnelActive
    ).toBe(false)
    expect(parseServeConfig(JSON.stringify({})).funnelActive).toBe(false)
  })

  it("stays safe on malformed json", () => {
    const parsed = parseServeConfig("not json")

    expect(parsed.serveHttpsActive).toBe(false)
    expect(parsed.funnelActive).toBe(false)
  })
})
