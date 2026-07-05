import { appendEvent } from "@/db/repositories.server"

export type SecurityEventType =
  | "security.scope_denied"
  | "security.escalation_denied"
  | "security.paired"
  | "security.connection_revoked"
  | "security.connection_scopes_updated"
  | "security.login"
  | "security.panic"

export async function recordSecurityEvent(input: {
  type: SecurityEventType
  message: string
  actorSessionId?: string | null
  actorKind?: string | null
  source?: string | null
  metadata?: Record<string, unknown>
}) {
  try {
    await appendEvent({
      type: input.type,
      actorSessionId: input.actorSessionId ?? undefined,
      actorKind: input.actorKind ?? undefined,
      source: input.source ?? undefined,
      message: input.message,
      metadata: input.metadata,
    })
  } catch {
    return
  }
}
