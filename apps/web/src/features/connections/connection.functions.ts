import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { authMiddleware } from "@/features/auth/auth-middleware"
import type { ParsedUserAgent } from "@/features/connections/user-agent"

const labelSchema = z.string().trim().min(1).max(64)

const createPairingLinkSchema = z.object({
  label: labelSchema,
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

type SerializedPairingLink = {
  id: string
  label: string
  createdBy: string
  createdAt: string
  expiresAt: string
  consumedAt: string | null
  connectionSessionId: string | null
  revokedAt: string | null
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
  metadata: ParsedUserAgent
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
  }
}

function serializeConnectionMetadata(
  metadata: Record<string, unknown>
): ParsedUserAgent {
  const device = metadata.device

  return {
    browser: typeof metadata.browser === "string" ? metadata.browser : null,
    os: typeof metadata.os === "string" ? metadata.os : null,
    device:
      device === "desktop" || device === "mobile" || device === "tablet"
        ? device
        : null,
  }
}

export const createPairingLinkFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => createPairingLinkSchema.parse(data))
  .handler(async ({ data, context }) => {
    const {
      createPairingLink,
    } = await import("@/db/repositories.server")
    const {
      PAIRING_LINK_TTL_SECONDS,
      createPairingToken,
      hashPairingToken,
    } = await import("@/features/connections/pairing-token.server")

    const token = createPairingToken()
    const link = await createPairingLink({
      tokenHash: hashPairingToken(token),
      label: data.label,
      createdBy: context.session.sid,
      expiresAt: new Date(
        Date.now() + PAIRING_LINK_TTL_SECONDS * 1000
      ).toISOString(),
    })

    return { token, link: serializePairingLink(link) }
  })

export const listPairingLinksFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { listPairingLinks } = await import("@/db/repositories.server")
    const now = new Date().toISOString()

    return (await listPairingLinks())
      .filter(
        (link) =>
          !link.consumedAt && !link.revokedAt && link.expiresAt > now
      )
      .map(serializePairingLink)
  })

export const revokePairingLinkFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => linkIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { revokePairingLink } = await import("@/db/repositories.server")

    await revokePairingLink(data.linkId)
    return { ok: true }
  })

export const listConnectionsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Array<SerializedConnection>> => {
    const { listAccessSessions } = await import("@/db/repositories.server")
    const now = Date.now()

    return (await listAccessSessions())
      .filter((session) => session.kind === "connection")
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
  .middleware([authMiddleware])
  .validator((data: unknown) => renameConnectionSchema.parse(data))
  .handler(async ({ data }) => {
    const {
      getAccessSession,
      updateAccessSessionLabel,
    } = await import("@/db/repositories.server")
    const session = await getAccessSession(data.sessionId)

    if (!session || session.kind !== "connection") {
      throw new Error("Connection not found.")
    }

    await updateAccessSessionLabel(session.id, data.label)
    return { ok: true }
  })

export const revokeConnectionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => revokeConnectionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const {
      getAccessSession,
      revokeAccessSession,
    } = await import("@/db/repositories.server")

    if (data.sessionId === context.session.sid) {
      throw new Error("Use logout instead.")
    }

    const session = await getAccessSession(data.sessionId)
    if (!session || session.kind !== "connection") {
      throw new Error("Connection not found.")
    }

    await revokeAccessSession(session.id)
    return { ok: true }
  })
