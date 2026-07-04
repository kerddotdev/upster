import { createFileRoute } from "@tanstack/react-router"
import { UpsterApiError } from "@upster/core"
import { z } from "zod"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { getRun } from "@/db/repositories.server"
import { stopPillRun } from "@/features/processes/supervisor.server"

const stopBodySchema = z.object({
  runId: z.string().min(1).optional(),
})

export const Route = createFileRoute("/api/cli/v1/pills/$pillId/stop")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(request, ["runs:stop"], "stop pill runs")
          const body = stopBodySchema.parse(await readJsonBody(request))

          if (body.runId) {
            const run = await getRun(body.runId)

            if (!run || run.pillId !== params.pillId) {
              throw new UpsterApiError({
                status: 404,
                code: "RUN_NOT_FOUND",
                message: "The requested run was not found for this pill.",
                reason:
                  "The run id does not belong to the pill in the request path.",
                cause:
                  "The run id may be mistyped, belong to another pill, or already be deleted.",
                remediation:
                  "Run upster pills get <pillId> --json and use that pill's activeRun id.",
                humanActionRequired: false,
                docsCommand: "upster agent doctor",
              })
            }
          }

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
