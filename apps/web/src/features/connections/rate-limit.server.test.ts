import { describe, expect, it } from "vitest"

import { createRateLimiter } from "@/features/connections/rate-limit.server"

describe("rate limiter", () => {
  it("limits calls inside a fixed window and resets after rollover", () => {
    let current = 1_000
    const limiter = createRateLimiter({
      max: 2,
      windowMs: 100,
      now: () => current,
    })

    expect(limiter.take("client").allowed).toBe(true)
    expect(limiter.take("client").allowed).toBe(true)
    expect(limiter.take("client").allowed).toBe(false)

    current = 1_100

    expect(limiter.take("client").allowed).toBe(true)
  })

  it("isolates counters by key", () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      now: () => 1_000,
    })

    expect(limiter.take("a").allowed).toBe(true)
    expect(limiter.take("a").allowed).toBe(false)
    expect(limiter.take("b").allowed).toBe(true)
  })
})
