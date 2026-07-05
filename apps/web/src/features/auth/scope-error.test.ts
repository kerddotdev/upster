import { describe, expect, it } from "vitest"

import { ScopeDeniedError, isScopeDeniedMessage } from "./scope-error"

describe("ScopeDeniedError", () => {
  it("encodes the missing scopes in the message", () => {
    const error = new ScopeDeniedError(["pills:write", "runs:start"])

    expect(error.message).toBe("Missing permission: pills:write, runs:start")
    expect(error.requiredScopes).toEqual(["pills:write", "runs:start"])
  })

  it("detects scope denied messages after serialization", () => {
    const error = new ScopeDeniedError(["vault:unlock"])
    const roundTripped = error.message

    expect(isScopeDeniedMessage(roundTripped)).toBe(true)
    expect(isScopeDeniedMessage("Something else went wrong.")).toBe(false)
    expect(isScopeDeniedMessage(null)).toBe(false)
  })
})
