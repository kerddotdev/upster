import { createFileRoute } from "@tanstack/react-router"

import { verifyRequestSession } from "@/features/auth/session.server"
import { getRunMetrics } from "@/features/metrics/metrics.server"

export const Route = createFileRoute("/api/runs/$runId/metrics")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const session = await verifyRequestSession(
          request.headers.get("cookie"),
          request.headers.get("host")
        )
        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 })
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
