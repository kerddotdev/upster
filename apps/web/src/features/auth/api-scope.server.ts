import { scopesIncludeAll, type AccessScope } from "@upster/core"

import { readRequestOriginInfoFromHeaders } from "@/features/auth/admin-origin"
import {
  verifyRequestSession,
  type SessionContext,
} from "@/features/auth/session.server"

export type ApiAuthResult =
  | { ok: true; session: SessionContext }
  | { ok: false; response: Response }

export async function authorizeApiRequest(
  request: Request,
  ...requiredScopes: Array<AccessScope>
): Promise<ApiAuthResult> {
  const session = await verifyRequestSession(
    request.headers.get("cookie"),
    readRequestOriginInfoFromHeaders(request.headers)
  )

  if (!session) {
    return {
      ok: false,
      response: new Response("Unauthorized", { status: 401 }),
    }
  }

  if (!scopesIncludeAll(session.scopes, requiredScopes)) {
    return { ok: false, response: new Response("Forbidden", { status: 403 }) }
  }

  return { ok: true, session }
}
