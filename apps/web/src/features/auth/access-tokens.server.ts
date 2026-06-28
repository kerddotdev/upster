import { createHash, randomBytes } from "node:crypto"

export function createAccessToken() {
  return `upst_${randomBytes(32).toString("base64url")}`
}

export function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest("base64url")
}
