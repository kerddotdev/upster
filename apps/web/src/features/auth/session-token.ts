import { createHmac, timingSafeEqual } from "node:crypto"

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

export type SessionPayload = {
  sub: string
  sid: string
  exp: number
}

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url")
}

export function createSessionToken(
  sub: string,
  sid: string,
  secret: string,
  nowMs: number = Date.now(),
  ttlSeconds = SESSION_TTL_SECONDS
) {
  const payload: SessionPayload = {
    sub,
    sid,
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")

  return `${body}.${sign(body, secret)}`
}

export function verifySessionToken(
  token: string | null,
  secret: string,
  nowMs: number = Date.now()
): SessionPayload | null {
  if (!token) {
    return null
  }

  const dot = token.indexOf(".")
  if (dot === -1) {
    return null
  }

  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expected = sign(body, secret)
  const signatureBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expected)

  if (
    signatureBuf.length !== expectedBuf.length ||
    !timingSafeEqual(signatureBuf, expectedBuf)
  ) {
    return null
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as SessionPayload

    if (
      typeof payload.exp !== "number" ||
      payload.exp * 1000 < nowMs ||
      typeof payload.sid !== "string"
    ) {
      return null
    }

    return payload
  } catch {
    return null
  }
}
