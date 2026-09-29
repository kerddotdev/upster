import { randomBytes } from "node:crypto"

import {
  getRequestHeader,
  setResponseHeader,
} from "@tanstack/react-start/server"
import { adminScopes, type AccessScope } from "@upster/core"

import {
  createAccessSession,
  createAppSettingIfAbsent,
  getAccessSession,
  getAppSetting,
  revokeAccessSession,
  touchAccessSession,
  type AccessSession,
  type AccessSessionKind,
} from "@/db/repositories.server"
import {
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/features/auth/session-token"
import {
  isSessionKindAllowedForRequest,
  isTailnetIdentityMismatch,
  readRequestOriginInfo,
  type RequestOriginInfo,
} from "@/features/auth/admin-origin"

const COOKIE_NAME = "upster_session"
const SECRET_SETTING_KEY = "session_secret"
const MIN_SECRET_LENGTH = 16
export const CONNECTION_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 400
export const CONNECTION_EXPIRES_AT_SENTINEL = "9999-12-31T23:59:59.000Z"

let cachedSecret: string | null = null

async function getSessionSecret() {
  const fromEnv = process.env.UPSTER_SESSION_SECRET?.trim()
  if (fromEnv) {
    if (fromEnv.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `UPSTER_SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`
      )
    }
    return fromEnv
  }

  if (cachedSecret) {
    return cachedSecret
  }

  const existing = await getAppSetting(SECRET_SETTING_KEY)
  if (existing) {
    cachedSecret = existing
    return existing
  }

  // Persist atomically so concurrent cold requests converge on one secret:
  // the first writer wins and everyone reads back the same persisted value.
  const generated = randomBytes(32).toString("hex")
  await createAppSettingIfAbsent(SECRET_SETTING_KEY, generated)
  const persisted = (await getAppSetting(SECRET_SETTING_KEY)) ?? generated
  cachedSecret = persisted
  return persisted
}

function readSessionCookie() {
  const header = getRequestHeader("cookie")
  if (!header) {
    return null
  }

  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=")
    if (eq === -1) {
      continue
    }
    if (part.slice(0, eq) === COOKIE_NAME) {
      return part.slice(eq + 1)
    }
  }

  return null
}

function readTokenFromCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) {
    return null
  }

  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf("=")
    if (eq === -1) {
      continue
    }
    if (part.slice(0, eq) === COOKIE_NAME) {
      return part.slice(eq + 1)
    }
  }

  return null
}

function isSecureRequest() {
  if (process.env.UPSTER_SECURE_COOKIES === "true") {
    return true
  }

  return getRequestHeader("x-forwarded-proto") === "https"
}

function setSessionCookie(token: string, maxAge: number) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ]

  if (isSecureRequest()) {
    parts.push("Secure")
  }

  setResponseHeader("Set-Cookie", parts.join("; "))
}

export async function issueSessionCookie(sub: string) {
  const secret = await getSessionSecret()
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
  const session = await createAccessSession({
    kind: "dashboard",
    subject: sub,
    label: "Dashboard",
    scopes: adminScopes,
    expiresAt: expiresAt.toISOString(),
    userAgent: getRequestHeader("user-agent"),
    metadata: {},
  })
  const token = createSessionToken(sub, session.id, secret)
  setSessionCookie(token, SESSION_TTL_SECONDS)
  return session
}

export async function issueConnectionCookie(input: {
  label: string
  userAgent?: string | null
  remoteAddr?: string | null
  scopes?: Array<AccessScope>
  tailnetIdentity?: string | null
  metadata?: Record<string, unknown>
}) {
  const secret = await getSessionSecret()
  const session = await createAccessSession({
    kind: "connection",
    subject: "admin",
    label: input.label,
    scopes: input.scopes ?? adminScopes,
    expiresAt: CONNECTION_EXPIRES_AT_SENTINEL,
    userAgent: input.userAgent ?? getRequestHeader("user-agent"),
    remoteAddr: input.remoteAddr ?? null,
    metadata: {
      ...(input.metadata ?? {}),
      tailnetIdentity: input.tailnetIdentity ?? null,
    },
  })
  const token = createSessionToken(
    "admin",
    session.id,
    secret,
    Date.now(),
    CONNECTION_TOKEN_TTL_SECONDS
  )
  setSessionCookie(token, CONNECTION_TOKEN_TTL_SECONDS)
  return session
}

export function clearSessionCookie() {
  setResponseHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  )
}

export type SessionContext = {
  sub: string
  sid: string
  exp: number
  kind: AccessSessionKind
  scopes: Array<AccessScope>
}

function toSessionContext(verified: VerifiedSession): SessionContext {
  return {
    sub: verified.payload.sub,
    sid: verified.payload.sid,
    exp: verified.payload.exp,
    kind: verified.session.kind,
    scopes: verified.session.scopes,
  }
}

export async function readSession(): Promise<SessionContext | null> {
  const secret = await getSessionSecret()
  const verified = await verifySessionPayload(
    readSessionCookie(),
    secret,
    readCurrentRequestOriginInfo()
  )
  if (!verified) {
    return null
  }

  await renewConnectionCookieIfNeeded(verified, secret)
  return toSessionContext(verified)
}

export async function verifyRequestSession(
  cookieHeader: string | null,
  originInfo?: RequestOriginInfo | null
): Promise<SessionContext | null> {
  const secret = await getSessionSecret()
  const verified = await verifySessionPayload(
    readTokenFromCookieHeader(cookieHeader),
    secret,
    originInfo ?? null
  )

  return verified ? toSessionContext(verified) : null
}

type VerifiedSession = {
  payload: SessionPayload
  session: AccessSession
}

async function verifySessionPayload(
  token: string | null,
  secret: string,
  originInfo: RequestOriginInfo | null
): Promise<VerifiedSession | null> {
  const payload = verifySessionToken(token, secret)
  if (!payload) {
    return null
  }

  const session = await getAccessSession(payload.sid)
  const effectiveOrigin = originInfo ?? readCurrentRequestOriginInfo()
  if (
    !session ||
    session.revokedAt ||
    new Date(session.expiresAt).getTime() <= Date.now() ||
    isDisallowedDashboardSession(session, effectiveOrigin) ||
    isReplayedConnection(session, effectiveOrigin)
  ) {
    return null
  }

  await touchAccessSession(session.id)
  return { payload, session }
}

function isReplayedConnection(
  session: AccessSession,
  originInfo: RequestOriginInfo
) {
  if (session.kind !== "connection") {
    return false
  }

  const storedIdentity =
    typeof session.metadata.tailnetIdentity === "string"
      ? session.metadata.tailnetIdentity
      : null

  return isTailnetIdentityMismatch(storedIdentity, originInfo)
}

function isDisallowedDashboardSession(
  session: AccessSession,
  originInfo: RequestOriginInfo | null
) {
  return !isSessionKindAllowedForRequest(
    session.kind,
    originInfo ?? readCurrentRequestOriginInfo(),
    process.env.UPSTER_BIND_HOST
  )
}

function readCurrentRequestOriginInfo(): RequestOriginInfo {
  return readRequestOriginInfo((name) => {
    try {
      return getRequestHeader(name) ?? null
    } catch {
      return null
    }
  })
}

async function renewConnectionCookieIfNeeded(
  verified: VerifiedSession,
  secret: string
) {
  if (verified.session.kind !== "connection") {
    return
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (verified.payload.exp - nowSeconds > CONNECTION_TOKEN_TTL_SECONDS / 2) {
    return
  }

  try {
    const token = createSessionToken(
      verified.payload.sub,
      verified.payload.sid,
      secret,
      Date.now(),
      CONNECTION_TOKEN_TTL_SECONDS
    )
    setSessionCookie(token, CONNECTION_TOKEN_TTL_SECONDS)
  } catch {
    return
  }
}

export async function endCurrentSession() {
  const session = await readSession()

  if (session) {
    await revokeAccessSession(session.sid)
  }

  clearSessionCookie()
}
