import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { authMiddleware } from "@/features/auth/auth-middleware"

const revokeSessionSchema = z.object({
  sessionId: z.string().min(1),
})

export const listSessionsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { listAccessSessions } = await import("@/db/repositories.server")

    return (await listAccessSessions()).map((session) => ({
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
    }))
  })

export const revokeSessionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => revokeSessionSchema.parse(data))
  .handler(async ({ data }) => {
    const { revokeAccessSession } = await import("@/db/repositories.server")

    await revokeAccessSession(data.sessionId)
    return { ok: true }
  })
