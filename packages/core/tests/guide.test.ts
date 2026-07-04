import { describe, expect, it } from "vitest"

import {
  getAgentGuide,
  missingScopeError,
  renderCliHelp,
  vaultLockedError,
} from "../src"

describe("agent guide and errors", () => {
  it("renders detailed CLI help", () => {
    const help = renderCliHelp()

    expect(help).toContain("Auth model:")
    expect(help).toContain("Agent-safe commands:")
    expect(help).toContain("upster agent doctor --json")
    expect(help).toContain("MISSING_SCOPE")
  })

  it("documents capsule and snapshot deploy commands in CLI help", () => {
    const help = renderCliHelp()

    expect(help).toContain("upster capsules build")
    expect(help).toContain("upster capsules pin")
    expect(help).toContain("upster capsules prune")
    expect(help).toContain("--use-capsule")
    expect(help).toContain("--target preview")
    expect(help).toContain("upster runtime")
    expect(help).toContain("capsules:write")
  })

  it("returns a JSON agent guide with scopes and errors", () => {
    const guide = getAgentGuide()

    expect(guide.scopes.some((entry) => entry.scope === "runs:start")).toBe(
      true
    )
    expect(
      guide.commonErrors.some((error) => error.code === "VAULT_LOCKED")
    ).toBe(true)
  })

  it("advertises capsule commands and scopes in the agent guide", () => {
    const guide = getAgentGuide()

    expect(guide.scopes.some((entry) => entry.scope === "capsules:write")).toBe(
      true
    )
    expect(
      guide.agentSafeCommands.some((command) =>
        command.startsWith("upster capsules build")
      )
    ).toBe(true)
    expect(
      guide.agentSafeCommands.some((command) =>
        command.includes("--target preview")
      )
    ).toBe(true)
    expect(guide.presets.agentFullRuntime).toContain("capsules:write")
  })

  it("includes detailed permission remediation fields", () => {
    const error = missingScopeError({
      action: "start pill runs",
      requiredScopes: ["runs:start"],
      currentScopes: ["pills:read"],
    }).toError()

    expect(error.reason).toContain("runs:start")
    expect(error.cause).toBeTruthy()
    expect(error.remediation).toBeTruthy()
    expect(error.humanActionRequired).toBe(true)
    expect(error.requiredScopes).toEqual(["runs:start"])
    expect(error.currentScopes).toEqual(["pills:read"])
  })

  it("keeps vault errors free of secret-like fields", () => {
    const serialized = JSON.stringify(vaultLockedError().toError())

    expect(serialized).not.toContain("apiToken")
    expect(serialized).not.toContain("ciphertext")
    expect(serialized).not.toContain("passphrase")
  })
})
