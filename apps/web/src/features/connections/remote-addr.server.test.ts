import { describe, expect, it } from "vitest"

import { getClientAddr } from "@/features/connections/remote-addr.server"

describe("remote address", () => {
  it("returns null when there is no forwarded header", () => {
    expect(getClientAddr(new Headers())).toBeNull()
  })

  it("returns the first forwarded hop from the proxy", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 198.51.100.2",
    })

    expect(getClientAddr(headers)).toBe("203.0.113.10")
  })

  it("returns null for empty forwarded headers", () => {
    const headers = new Headers({
      "x-forwarded-for": " , 198.51.100.2",
    })

    expect(getClientAddr(headers)).toBeNull()
  })
})
