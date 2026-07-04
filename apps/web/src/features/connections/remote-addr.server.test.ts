import { afterEach, describe, expect, it } from "vitest"

import { getClientAddr } from "@/features/connections/remote-addr.server"

describe("remote address", () => {
  afterEach(() => {
    delete process.env.UPSTER_TRUST_PROXY
  })

  it("ignores forwarded addresses unless proxy trust is enabled", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 198.51.100.2",
    })

    expect(getClientAddr(headers)).toBeNull()
  })

  it("returns the first forwarded hop when proxy trust is enabled", () => {
    process.env.UPSTER_TRUST_PROXY = "true"
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 198.51.100.2",
    })

    expect(getClientAddr(headers)).toBe("203.0.113.10")
  })

  it("returns null for empty trusted forwarded headers", () => {
    process.env.UPSTER_TRUST_PROXY = "true"
    const headers = new Headers({
      "x-forwarded-for": " , 198.51.100.2",
    })

    expect(getClientAddr(headers)).toBeNull()
  })
})
