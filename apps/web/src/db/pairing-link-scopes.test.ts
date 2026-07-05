import { describe, expect, it } from "vitest"
import { adminScopes, scopesIncludeAll } from "@upster/core"

import { parsePairingLinkScopes } from "./repositories.server"

describe("parsePairingLinkScopes", () => {
  it("falls back to admin scopes for legacy or empty values", () => {
    expect(parsePairingLinkScopes(null)).toEqual([...adminScopes])
    expect(parsePairingLinkScopes("")).toEqual([...adminScopes])
    expect(parsePairingLinkScopes("[]")).toEqual([...adminScopes])
    expect(parsePairingLinkScopes("not json")).toEqual([...adminScopes])
    expect(parsePairingLinkScopes("{}")).toEqual([...adminScopes])
  })

  it("keeps only known access scopes", () => {
    expect(
      parsePairingLinkScopes(JSON.stringify(["pills:read", "bogus", 42]))
    ).toEqual(["pills:read"])
  })

  it("returns admin scopes when nothing valid survives filtering", () => {
    expect(parsePairingLinkScopes(JSON.stringify(["bogus"]))).toEqual([
      ...adminScopes,
    ])
  })
})

describe("pairing link subset cap", () => {
  it("allows a subset of the creator scopes", () => {
    expect(
      scopesIncludeAll(
        ["pills:read", "pills:write", "runs:start"],
        ["pills:read", "runs:start"]
      )
    ).toBe(true)
  })

  it("rejects requesting a scope the creator lacks", () => {
    expect(
      scopesIncludeAll(["pills:read"], ["pills:read", "vault:delete"])
    ).toBe(false)
  })
})
