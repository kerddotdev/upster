import { createFileRoute } from "@tanstack/react-router"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { stopPillRun } from "@/features/processes/supervisor.server"

export const Route = createFileRoute("/api/cli/v1/pills/$pillId/stop")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(request, ["runs:stop"], "stop pill runs")
          const body = (await readJsonBody(request)) as { runId?: string }

          await stopPillRun({
            pillId: params.pillId,
            runId: body.runId,
          })

          return getStoppedPayload(params.pillId, body.runId)
        }, id)
      },
    },
  },
})

function getStoppedPayload(pillId: string, runId: string | undefined) {
  return {
    pillId,
    runId: runId ?? null,
    status: "stopped",
  }
}
