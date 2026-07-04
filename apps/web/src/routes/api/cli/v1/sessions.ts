import { createFileRoute } from "@tanstack/react-router"

import {
  authenticateCliRequest,
  serializeAccessSession,
} from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { listAccessSessions } from "@/db/repositories.server"

export const Route = createFileRoute("/api/cli/v1/sessions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["sessions:read"],
            "list access sessions"
          )

          return (await listAccessSessions()).map(serializeAccessSession)
        }, id)
      },
    },
  },
})
