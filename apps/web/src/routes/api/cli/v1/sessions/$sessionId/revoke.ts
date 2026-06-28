import { createFileRoute } from "@tanstack/react-router"

import {
  authenticateCliRequest,
  serializeAccessSession,
} from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { getAccessSession, revokeAccessSession } from "@/db/repositories.server"

export const Route = createFileRoute("/api/cli/v1/sessions/$sessionId/revoke")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["sessions:revoke"],
            "revoke access sessions"
          )

          await revokeAccessSession(params.sessionId)
          const session = await getAccessSession(params.sessionId)

          return session
            ? serializeAccessSession(session)
            : { id: params.sessionId }
        }, id)
      },
    },
  },
})
