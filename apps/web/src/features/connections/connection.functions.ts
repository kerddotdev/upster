import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { accessScopes, scopesIncludeAll, type AccessScope } from "@upster/core"

import { requireScopes } from "@/features/auth/scope-middleware"
import { ScopeDeniedError } from "@/features/auth/scope-error"
import { assertLocalAdmin } from "@/features/auth/local-admin"
import type { ParsedUserAgent } from "@/features/connections/user-agent"

const labelSchema = z.string().trim().min(1).max(64)

const createPairingLinkSchema = z.object({
  label: labelSchema,
  scopes: z.array(z.enum(accessScopes)).min(1),
})

const linkIdSchema = z.object({
  linkId: z.string().min(1),
})

const renameConnectionSchema = z.object({
  sessionId: z.string().min(1),
  label: labelSchema,
})

const revokeConnectionSchema = z.object({
  sessionId: z.string().min(1),
})

const updateConnectionScopesSchema = z.object({
  sessionId: z.string().min(1),
  scopes: z.array(z.enum(accessScopes)).min(1),
})

type SerializedPairingLink = {
  id: string
  label: string
  createdBy: string
  createdAt: string
  expiresAt: string
  consumedAt: string | null
  connectionSessionId: string | null
  revokedAt: string | null
  scopes: Array<string>
}

type ConnectionMetadata = ParsedUserAgent & {
  tailnetIdentity: string | null
}

type SerializedConnection = {
  id: string
  label: string
  subject: string
  scopes: Array<string>
  createdAt: string
  lastSeenAt: string | null
  expiresAt: string
  revokedAt: string | null
  userAgent: string | null
  remoteAddr: string | null
  metadata: ConnectionMetadata
  isCurrent: boolean
  connectedNow: boolean
}

function serializePairingLink(link: SerializedPairingLink) {
  return {
    id: link.id,
    label: link.label,
    createdBy: link.createdBy,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    consumedAt: link.consumedAt,
    connectionSessionId: link.connectionSessionId,
    revokedAt: link.revokedAt,
    scopes: link.scopes,
  }
}

function serializeConnectionMetadata(
  metadata: Record<string, unknown>
): ConnectionMetadata {
  const device = metadata.device

  return {
    browser: typeof metadata.browser === "string" ? metadata.browser : null,
    os: typeof metadata.os === "string" ? metadata.os : null,
    device:
      device === "desktop" || device === "mobile" || device === "tablet"
        ? device
        : null,
    tailnetIdentity:
      typeof metadata.tailnetIdentity === "string"
        ? metadata.tailnetIdentity
        : null,
  }
}

type ScopeCapActor = {
  sid: string
  kind: string
  scopes: Array<AccessScope>
}

async function capRequestedScopes(
  actor: ScopeCapActor,
  requested: Array<AccessScope>,
  source: string,
  describe: (missing: Array<AccessScope>) => string
) {
  const deduped = Array.from(new Set(requested))
  if (scopesIncludeAll(actor.scopes, deduped)) {
    return deduped
  }

  const missing = deduped.filter((scope) => !actor.scopes.includes(scope))
  const { recordSecurityEvent } =
    await import("@/features/auth/security-audit.server")
  await recordSecurityEvent({
    type: "security.escalation_denied",
    message: describe(missing),
    actorSessionId: actor.sid,
    actorKind: actor.kind,
    source,
    metadata: { requestedScopes: deduped, missingScopes: missing },
  })
  throw new ScopeDeniedError(missing)
}

export const createPairingLinkFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("connections:manage")])
  .validator((data: unknown) => createPairingLinkSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { createPairingLink } = await import("@/db/repositories.server")
    const { PAIRING_LINK_TTL_SECONDS, createPairingToken, hashPairingToken } =
      await import("@/features/connections/pairing-token.server")

    const requestedScopes = await capRequestedScopes(
      context.session,
      data.scopes,
      "pairing-link",
      (missing) =>
        `Denied a pairing link requesting scopes beyond the creator: ${missing.join(", ")}.`
    )

    const token = createPairingToken()
    const link = await createPairingLink({
      tokenHash: hashPairingToken(token),
      label: data.label,
      createdBy: context.session.sid,
      expiresAt: new Date(
        Date.now() + PAIRING_LINK_TTL_SECONDS * 1000
      ).toISOString(),
      scopes: requestedScopes,
    })

    return { token, link: serializePairingLink(link) }
  })

export const listPairingLinksFn = createServerFn({ method: "GET" })
  .middleware([requireScopes("connections:read")])
  .handler(async () => {
    const { listPairingLinks } = await import("@/db/repositories.server")
    const now = new Date().toISOString()

    return (await listPairingLinks())
      .filter(
        (link) => !link.consumedAt && !link.revokedAt && link.expiresAt > now
      )
      .map(serializePairingLink)
  })

export const revokePairingLinkFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("connections:manage")])
  .validator((data: unknown) => linkIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { revokePairingLink } = await import("@/db/repositories.server")

    await revokePairingLink(data.linkId)
    return { ok: true }
  })

export const listConnectionsFn = createServerFn({ method: "GET" })
  .middleware([requireScopes("connections:read")])
  .handler(async ({ context }): Promise<Array<SerializedConnection>> => {
    const { listAccessSessions } = await import("@/db/repositories.server")
    const now = Date.now()

    return (await listAccessSessions())
      .filter((session) => session.kind === "connection" && !session.revokedAt)
      .map((session) => ({
        id: session.id,
        label: session.label,
        subject: session.subject,
        scopes: session.scopes,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        userAgent: session.userAgent,
        remoteAddr: session.remoteAddr,
        metadata: serializeConnectionMetadata(session.metadata),
        isCurrent: session.id === context.session.sid,
        connectedNow: session.lastSeenAt
          ? now - new Date(session.lastSeenAt).getTime() < 60_000
          : false,
      }))
  })

export const renameConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("connections:manage")])
  .validator((data: unknown) => renameConnectionSchema.parse(data))
  .handler(async ({ data }) => {
    const { getAccessSession, updateAccessSessionLabel } =
      await import("@/db/repositories.server")
    const session = await getAccessSession(data.sessionId)

    if (!session || session.kind !== "connection") {
      throw new Error("Connection not found.")
    }

    await updateAccessSessionLabel(session.id, data.label)
    return { ok: true }
  })

export const updateConnectionScopesFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("connections:manage")])
  .validator((data: unknown) => updateConnectionScopesSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { getAccessSession, updateAccessSessionScopes } =
      await import("@/db/repositories.server")
    const session = await getAccessSession(data.sessionId)

    if (!session || session.kind !== "connection") {
      throw new Error("Connection not found.")
    }

    const scopes = await capRequestedScopes(
      context.session,
      data.scopes,
      "connection-scopes",
      (missing) =>
        `Denied a connection scope update beyond the caller: ${missing.join(", ")}.`
    )

    await updateAccessSessionScopes(session.id, scopes)
    return { ok: true }
  })

export const revokeConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("connections:manage")])
  .validator((data: unknown) => revokeConnectionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { getAccessSession, revokeAccessSession } =
      await import("@/db/repositories.server")
    const { lockCloudflareVault } =
      await import("@/features/secrets/vault-session.server")

    if (data.sessionId === context.session.sid) {
      throw new Error("Use logout instead.")
    }

    const session = await getAccessSession(data.sessionId)
    if (!session || session.kind !== "connection") {
      throw new Error("Connection not found.")
    }

    await revokeAccessSession(session.id)
    await lockCloudflareVault({ sessionId: session.id, kind: "connection" })

    const { recordSecurityEvent } =
      await import("@/features/auth/security-audit.server")
    await recordSecurityEvent({
      type: "security.connection_revoked",
      message: `Revoked connection ${session.label}.`,
      actorSessionId: context.session.sid,
      actorKind: context.session.kind,
      source: "connection",
      metadata: { connectionId: session.id },
    })

    return { ok: true }
  })

export const panicLockdownFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("connections:manage")])
  .handler(async ({ context }) => {
    await assertLocalAdmin(
      "Remote Access lockdown can only be triggered from a local session."
    )

    const { revokeAllConnectionSessions } =
      await import("@/db/repositories.server")
    const { lockCloudflareVault } =
      await import("@/features/secrets/vault-session.server")
    const { disableTailscaleServe } =
      await import("@/features/tailscale/tailscale-control.server")
    const { recordSecurityEvent } =
      await import("@/features/auth/security-audit.server")

    const revoked = await revokeAllConnectionSessions()
    await lockCloudflareVault()
    await disableTailscaleServe()

    await recordSecurityEvent({
      type: "security.panic",
      message: `Emergency lockdown revoked ${revoked} connection(s), locked the Vault and disabled remote access.`,
      actorSessionId: context.session.sid,
      actorKind: context.session.kind,
      source: "panic",
      metadata: { revoked },
    })

    return { ok: true, revoked }
  })

export const getConnectionEndpointsFn = createServerFn({ method: "GET" })
  .middleware([requireScopes("connections:read")])
  .handler(async () => {
    const { getRequest } = await import("@tanstack/react-start/server")
    const { getUpsterConfig } = await import("@/config/env.server")
    const { addCurrentRequestEndpoint, buildConnectionEndpoints } =
      await import("@/features/connections/endpoints.server")
    const { getTailscaleStatus } =
      await import("@/features/tailscale/tailscale-control.server")

    const request = getRequest()
    const config = getUpsterConfig()
    const status = await getTailscaleStatus()
    const endpoints = buildConnectionEndpoints(status, config.port)

    return addCurrentRequestEndpoint(endpoints, getCurrentOrigin(request))
  })

function getCurrentOrigin(request: Request) {
  const url = new URL(request.url)
  const forwardedHost = request.headers.get("x-forwarded-host")
  const forwardedProto = request.headers.get("x-forwarded-proto")
  const host = forwardedHost ?? url.host
  const proto = forwardedProto ?? url.protocol.slice(0, -1)

  return host ? `${proto}://${host}` : null
}
