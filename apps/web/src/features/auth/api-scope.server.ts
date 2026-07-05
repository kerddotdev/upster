import { scopesIncludeAll, type AccessScope } from "@upster/core"

import { readRequestOriginInfoFromHeaders } from "@/features/auth/admin-origin"
import {
  verifyRequestSession,
  type SessionContext,
} from "@/features/auth/session.server"

export type ApiAuthResult =
  | { ok: true; session: SessionContext }
  | { ok: false; status: 401 | 403; message: string }

export async function authorizeApiRequest(
  request: Request,
  ...requiredScopes: Array<AccessScope>
): Promise<ApiAuthResult> {
  const session = await verifyRequestSession(
    request.headers.get("cookie"),
    readRequestOriginInfoFromHeaders(request.headers)
  )

  if (!session) {
    return { ok: false, status: 401, message: "Unauthorized" }
  }

  if (!scopesIncludeAll(session.scopes, requiredScopes)) {
    return { ok: false, status: 403, message: "Forbidden" }
  }

  return { ok: true, session }
}
