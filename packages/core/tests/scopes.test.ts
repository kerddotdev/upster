import { describe, expect, it } from "vitest"

import {
  accessScopes,
  adminScopes,
  agentAllowedScopes,
  connectionScopePresets,
  humanOnlyScopes,
  isAccessScope,
  scopesIncludeAll,
} from "../src"

describe("connection scope presets", () => {
  it("presets are valid subsets of the admin scope set", () => {
    for (const preset of Object.values(connectionScopePresets)) {
      expect(preset.every((scope) => isAccessScope(scope))).toBe(true)
      expect(scopesIncludeAll(adminScopes, preset)).toBe(true)
    }
  })

  it("viewer has no write or delete scopes", () => {
    const forbidden = connectionScopePresets.viewer.filter((scope) =>
      /(:write|:delete|runs:)/.test(scope)
    )

    expect(forbidden).toEqual([])
  })

  it("operator is a superset of viewer", () => {
    expect(
      scopesIncludeAll(
        connectionScopePresets.operator,
        connectionScopePresets.viewer
      )
    ).toBe(true)
  })

  it("full admin covers every access scope", () => {
    expect(connectionScopePresets.fullAdmin).toEqual([...accessScopes])
  })
})

describe("scope taxonomy invariants", () => {
  it("keeps the agent allowed scope set unchanged", () => {
    expect(agentAllowedScopes).toEqual([
      "pills:read",
      "pills:write",
      "pills:delete",
      "capsules:read",
      "capsules:write",
      "capsules:delete",
      "runs:start",
      "runs:stop",
      "logs:read",
      "metrics:read",
      "runtime:read",
      "vault:status",
    ])
  })

  it("marks the new dashboard scopes as human only", () => {
    for (const scope of [
      "settings:read",
      "settings:write",
      "connections:read",
      "connections:manage",
    ] as const) {
      expect(humanOnlyScopes).toContain(scope)
      expect(agentAllowedScopes as Array<string>).not.toContain(scope)
    }
  })
})
