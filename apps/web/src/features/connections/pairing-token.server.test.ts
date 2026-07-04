import { describe, expect, it } from "vitest"

import {
  PAIRING_TOKEN_ALPHABET,
  PAIRING_TOKEN_LENGTH,
  createPairingToken,
  hashPairingToken,
} from "@/features/connections/pairing-token.server"

describe("pairing tokens", () => {
  it("creates short tokens with the expected alphabet", () => {
    const token = createPairingToken()

    expect(token).toHaveLength(PAIRING_TOKEN_LENGTH)
    expect([...token].every((char) => PAIRING_TOKEN_ALPHABET.includes(char)))
      .toBe(true)
  })

  it("does not use visually ambiguous characters", () => {
    const ambiguous = new Set(["0", "1", "I", "O", "l"])

    expect([...PAIRING_TOKEN_ALPHABET].some((char) => ambiguous.has(char)))
      .toBe(false)
    expect(PAIRING_TOKEN_ALPHABET).toHaveLength(32)
  })

  it("creates unique token material across a sample", () => {
    const tokens = new Set(
      Array.from({ length: 1_000 }, () => createPairingToken())
    )

    expect(tokens.size).toBe(1_000)
  })

  it("hashes pairing tokens without persisting plaintext", () => {
    const token = createPairingToken()
    const hash = hashPairingToken(token)

    expect(hash).not.toBe(token)
    expect(hashPairingToken(token)).toBe(hash)
  })
})
