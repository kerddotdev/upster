import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { authMiddleware } from "@/features/auth/auth-middleware"

const revokeSessionSchema = z.object({
  sessionId: z.string().min(1),
})

const sessionKinds = new Set(["dashboard", "cli", "agent"])

export const listSessionsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { listAccessSessions } = await import("@/db/repositories.server")

    return (await listAccessSessions())
      .filter((session) => sessionKinds.has(session.kind))
      .map((session) => ({
        id: session.id,
        kind: session.kind as "dashboard" | "cli" | "agent",
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
