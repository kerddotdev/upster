import { createMiddleware } from "@tanstack/react-start"
import { scopesIncludeAll, type AccessScope } from "@upster/core"

import { authMiddleware } from "@/features/auth/auth-middleware"
import { ScopeDeniedError } from "@/features/auth/scope-error"

export function requireScopes(...required: Array<AccessScope>) {
  return createMiddleware({ type: "function" })
    .middleware([authMiddleware])
    .server(async ({ next, context }) => {
      if (!scopesIncludeAll(context.session.scopes, required)) {
        const { recordSecurityEvent } =
          await import("@/features/auth/security-audit.server")
        await recordSecurityEvent({
          type: "security.scope_denied",
          message: `Denied a server function call requiring ${required.join(", ")}.`,
          actorSessionId: context.session.sid,
          actorKind: context.session.kind,
          source: "server-fn",
          metadata: { requiredScopes: required },
        })
        throw new ScopeDeniedError(required)
      }

      return next()
    })
}
