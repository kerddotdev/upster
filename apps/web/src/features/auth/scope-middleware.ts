import { createMiddleware } from "@tanstack/react-start"
import { scopesIncludeAll, type AccessScope } from "@upster/core"

import { authMiddleware } from "@/features/auth/auth-middleware"
import { ScopeDeniedError } from "@/features/auth/scope-error"

export function requireScopes(...required: Array<AccessScope>) {
  return createMiddleware({ type: "function" })
    .middleware([authMiddleware])
    .server(async ({ next, context }) => {
      if (!scopesIncludeAll(context.session.scopes, required)) {
        throw new ScopeDeniedError(required)
      }

      return next()
    })
}
