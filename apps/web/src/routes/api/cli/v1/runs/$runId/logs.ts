import { createFileRoute } from "@tanstack/react-router"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { getRunLogs } from "@/db/repositories.server"

export const Route = createFileRoute("/api/cli/v1/runs/$runId/logs")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(request, ["logs:read"], "read run logs")

          return getRunLogs(params.runId)
        }, id)
      },
    },
  },
})
