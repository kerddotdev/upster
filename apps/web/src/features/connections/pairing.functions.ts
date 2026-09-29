import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

const redeemPairingTokenSchema = z.object({
  token: z.string().min(8).max(64),
})

export type RedeemPairingTokenResult =
  | { ok: true }
  | { ok: false; reason: "invalid_or_expired" | "rate_limited" }

export const redeemPairingTokenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => redeemPairingTokenSchema.parse(data))
  .handler(async ({ data }): Promise<RedeemPairingTokenResult> => {
    const { getRequest } = await import("@tanstack/react-start/server")
    const { redeemGlobalRateLimiter, redeemIpRateLimiter } =
      await import("@/features/connections/rate-limit.server")
    const { getClientAddr } =
      await import("@/features/connections/remote-addr.server")
    const { hashPairingToken } =
      await import("@/features/connections/pairing-token.server")
    const { parseUserAgent } = await import("@/features/connections/user-agent")
    const { consumePairingLink, setPairingLinkConnectionSessionId } =
      await import("@/db/repositories.server")
    const { issueConnectionCookie } =
      await import("@/features/auth/session.server")
    const { readRequestOriginInfoFromHeaders, readTailnetIdentity } =
      await import("@/features/auth/admin-origin")

    const request = getRequest()
    const origin = readRequestOriginInfoFromHeaders(request.headers)
    const tailnetIdentity = readTailnetIdentity(
      (name) => request.headers.get(name),
      origin.cameThroughProxy
    )
    const remoteAddr = getClientAddr(request.headers)
    const globalLimit = redeemGlobalRateLimiter.take("global")
    const ipLimit = redeemIpRateLimiter.take(remoteAddr ?? "direct")

    if (!globalLimit.allowed || !ipLimit.allowed) {
      return { ok: false, reason: "rate_limited" }
    }

    const link = await consumePairingLink(hashPairingToken(data.token))
    if (!link) {
      return { ok: false, reason: "invalid_or_expired" }
    }

    const userAgent = request.headers.get("user-agent")
    const session = await issueConnectionCookie({
      label: link.label,
      userAgent,
      remoteAddr,
      scopes: link.scopes,
      tailnetIdentity,
      metadata: parseUserAgent(userAgent),
    })

    const { recordSecurityEvent } =
      await import("@/features/auth/security-audit.server")
    await recordSecurityEvent({
      type: "security.paired",
      message: `Paired a new connection: ${link.label}.`,
      actorSessionId: session.id,
      actorKind: "connection",
      source: "pairing",
      metadata: { scopes: link.scopes },
    })

    try {
      await setPairingLinkConnectionSessionId(link.id, session.id)
    } catch {
      return { ok: true }
    }

    return { ok: true }
  })
