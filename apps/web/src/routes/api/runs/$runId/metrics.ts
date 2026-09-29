import { createFileRoute } from "@tanstack/react-router"

import { authorizeApiRequest } from "@/features/auth/api-scope.server"
import { getRunMetrics } from "@/features/metrics/metrics.server"

export const Route = createFileRoute("/api/runs/$runId/metrics")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const auth = await authorizeApiRequest(request, "metrics:read")
        if (!auth.ok) {
          return Response.json({ error: auth.message }, { status: auth.status })
        }

        try {
          return Response.json(await getRunMetrics(params.runId))
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Metrics unavailable."

          return Response.json({ error: message }, { status: 503 })
        }
      },
    },
  },
})
