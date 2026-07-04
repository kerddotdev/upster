import { createFileRoute } from "@tanstack/react-router"

import {
  authenticateCliRequest,
  serializeAccessSession,
} from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { revokeAccessSession } from "@/db/repositories.server"

export const Route = createFileRoute("/api/cli/v1/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          const actor = await authenticateCliRequest(request, [], "sign out")
          await revokeAccessSession(actor.session.id)

          return serializeAccessSession({
            ...actor.session,
            revokedAt: new Date().toISOString(),
          })
        }, id)
      },
    },
  },
})
