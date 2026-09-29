import { randomBytes } from "node:crypto"

import { hashAccessToken } from "@/features/auth/access-tokens.server"

export const PAIRING_LINK_TTL_SECONDS = 300
export const PAIRING_TOKEN_LENGTH = 12
export const PAIRING_TOKEN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

export function createPairingToken() {
  return Array.from(randomBytes(PAIRING_TOKEN_LENGTH), (byte) =>
    PAIRING_TOKEN_ALPHABET.charAt(byte & 31)
  ).join("")
}

export function hashPairingToken(token: string) {
  return hashAccessToken(token)
}
