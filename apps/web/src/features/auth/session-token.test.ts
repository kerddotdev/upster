import { describe, expect, it } from "vitest"

import {
  createSessionToken,
  verifySessionToken,
} from "@/features/auth/session-token"

const secret = "test-secret"

describe("session token", () => {
  it("verifies a freshly signed token", () => {
    const token = createSessionToken("admin", "session-1", secret)
    expect(verifySessionToken(token, secret)).toMatchObject({
      sub: "admin",
      sid: "session-1",
    })
  })

  it("rejects a token signed with a different secret", () => {
    const token = createSessionToken("admin", "session-1", secret)
    expect(verifySessionToken(token, "other-secret")).toBeNull()
  })

  it("rejects a tampered payload", () => {
    const token = createSessionToken("admin", "session-1", secret)
    const [, signature] = token.split(".")
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: "attacker", sid: "session-1", exp: 9999999999 })
    ).toString("base64url")

    expect(verifySessionToken(`${forgedBody}.${signature}`, secret)).toBeNull()
  })

  it("rejects an expired token", () => {
    const issuedAt = 1_000_000_000_000
    const token = createSessionToken("admin", "session-1", secret, issuedAt)
    const wayLater = issuedAt + 1000 * 60 * 60 * 24 * 30

    expect(verifySessionToken(token, secret, wayLater)).toBeNull()
  })

  it("supports a custom token ttl", () => {
    const issuedAt = 1_000_000_000_000
    const token = createSessionToken("admin", "session-1", secret, issuedAt, 60)

    expect(verifySessionToken(token, secret, issuedAt + 59_000)).toMatchObject({
      sid: "session-1",
    })
    expect(verifySessionToken(token, secret, issuedAt + 61_000)).toBeNull()
  })

  it("rejects malformed tokens", () => {
    expect(verifySessionToken(null, secret)).toBeNull()
    expect(verifySessionToken("not-a-token", secret)).toBeNull()
  })
})
