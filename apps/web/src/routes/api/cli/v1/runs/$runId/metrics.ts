import { createFileRoute } from "@tanstack/react-router"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { getRunMetrics } from "@/features/metrics/metrics.server"

export const Route = createFileRoute("/api/cli/v1/runs/$runId/metrics")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["metrics:read"],
            "read tunnel metrics"
          )

          return getRunMetrics(params.runId)
        }, id)
      },
    },
  },
})
