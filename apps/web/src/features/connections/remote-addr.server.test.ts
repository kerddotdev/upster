import { describe, expect, it } from "vitest"

import { getClientAddr } from "@/features/connections/remote-addr.server"

describe("remote address", () => {
  it("returns null when there is no forwarded header", () => {
    expect(getClientAddr(new Headers(), true)).toBeNull()
  })

  it("returns the first forwarded hop when the proxy is trusted", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 198.51.100.2",
    })

    expect(getClientAddr(headers, true)).toBe("203.0.113.10")
  })

  it("returns null for empty forwarded headers", () => {
    const headers = new Headers({
      "x-forwarded-for": " , 198.51.100.2",
    })

    expect(getClientAddr(headers, true)).toBeNull()
  })

  it("ignores the forwarded header when the proxy is not trusted", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 198.51.100.2",
    })

    expect(getClientAddr(headers, false)).toBeNull()
  })
})
