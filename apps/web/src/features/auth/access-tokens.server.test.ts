import { describe, expect, it } from "vitest"

import {
  createAccessToken,
  hashAccessToken,
} from "@/features/auth/access-tokens.server"

describe("access tokens", () => {
  it("creates scoped bearer token material and stores only hashes", () => {
    const token = createAccessToken()
    const hash = hashAccessToken(token)

    expect(token).toMatch(/^upst_/)
    expect(hash).not.toBe(token)
    expect(hashAccessToken(token)).toBe(hash)
  })
})
