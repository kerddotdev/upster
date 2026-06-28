import type { AccessScope } from "@upster/core"
import {
  agentAllowedScopes,
  agentForbiddenError,
  expiredTokenError,
  invalidTokenError,
  missingScopeError,
  missingTokenError,
  revokedTokenError,
  scopesIncludeAll,
} from "@upster/core"

import {
  createAccessSession,
  getAccessSession,
  getAccessSessionByTokenHash,
  touchAccessSession,
  type AccessSession,
  type AccessSessionKind,
} from "@/db/repositories.server"
import {
  createAccessToken,
  hashAccessToken,
} from "@/features/auth/access-tokens.server"
import { verifyRequestSession } from "@/features/auth/session.server"

export type CliActor = {
  session: AccessSession
  scopes: Array<AccessScope>
}

const CLI_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

export function getBearerToken(request: Request) {
  const header = request.headers.get("authorization")
  if (!header) {
    return null
  }

  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() || null
}

export async function authenticateCliRequest(
  request: Request,
  requiredScopes: Array<AccessScope>,
  action: string
): Promise<CliActor> {
  const bearerToken = getBearerToken(request)
  const session = bearerToken
    ? await authenticateBearerToken(bearerToken)
    : await authenticateCookie(request)

  if (!session) {
    throw request.headers.get("cookie")
      ? invalidTokenError()
      : missingTokenError()
  }

  if (session.revokedAt) {
    throw revokedTokenError()
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    throw expiredTokenError()
  }

  if (!scopesIncludeAll(session.scopes, requiredScopes)) {
    throw missingScopeError({
      action,
      requiredScopes,
      currentScopes: session.scopes,
    })
  }

  await touchAccessSession(session.id)

  return {
    session,
    scopes: session.scopes,
  }
}

export function assertHumanCliActor(actor: CliActor, command: string) {
  if (actor.session.kind === "agent") {
    throw agentForbiddenError({
      action: "run this administrative command",
      command,
    })
  }
}

export async function createBearerSession(input: {
  kind: AccessSessionKind
  subject: string
  label: string
  scopes: Array<AccessScope>
  ttlSeconds?: number
  request?: Request
  metadata?: Record<string, unknown>
}) {
  const token = createAccessToken()
  const expiresAt = new Date(
    Date.now() + (input.ttlSeconds ?? CLI_SESSION_TTL_SECONDS) * 1000
  ).toISOString()
  const session = await createAccessSession({
    kind: input.kind,
    subject: input.subject,
    label: input.label,
    tokenHash: hashAccessToken(token),
    scopes: input.scopes,
    expiresAt,
    userAgent: input.request?.headers.get("user-agent"),
    remoteAddr: input.request?.headers.get("x-forwarded-for"),
    metadata: input.metadata,
  })

  return {
    token,
    session: serializeAccessSession(session),
  }
}

export function serializeAccessSession(session: AccessSession) {
  return {
    id: session.id,
    kind: session.kind,
    subject: session.subject,
    label: session.label,
    scopes: session.scopes,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    userAgent: session.userAgent,
    remoteAddr: session.remoteAddr,
    metadata: session.metadata,
  }
}

export function validateAgentScopes(scopes: Array<AccessScope>) {
  const forbidden = scopes.filter(
    (scope) => !(agentAllowedScopes as Array<string>).includes(scope)
  )

  if (forbidden.length) {
    throw agentForbiddenError({
      action: `receive ${forbidden.join(", ")}`,
      command:
        "upster agents create --label <label> --ttl 24h --scopes pills:read,runs:start,runs:stop,logs:read,metrics:read,vault:status",
    })
  }
}

async function authenticateBearerToken(token: string) {
  if (!token.startsWith("upst_")) {
    throw invalidTokenError()
  }

  const session = await getAccessSessionByTokenHash(hashAccessToken(token))

  if (!session) {
    throw invalidTokenError()
  }

  return session
}

async function authenticateCookie(request: Request) {
  const payload = await verifyRequestSession(request.headers.get("cookie"))

  if (!payload) {
    return null
  }

  return getAccessSession(payload.sid)
}
