import { createFileRoute } from "@tanstack/react-router"
import { UpsterApiError } from "@upster/core"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { getRun } from "@/db/repositories.server"

export const Route = createFileRoute("/api/cli/v1/runs/$runId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(request, ["runtime:read"], "read runs")
          const run = await getRun(params.runId)

          if (!run) {
            throw new UpsterApiError({
              status: 404,
              code: "RUN_NOT_FOUND",
              message: "The requested run was not found.",
              reason:
                "No pill run exists with the run id passed to this command.",
              cause:
                "The run id may be mistyped, deleted with its pill, or from another Upster instance.",
              remediation:
                "Run upster pills list --json and inspect activeRun ids, or ask the human operator for the correct run id.",
              humanActionRequired: false,
              docsCommand: "upster agent doctor",
            })
          }

          return run
        }, id)
      },
    },
  },
})
