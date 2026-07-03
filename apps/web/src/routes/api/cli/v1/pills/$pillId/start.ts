import { createFileRoute } from "@tanstack/react-router"
import { startPillSchema } from "@upster/core"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { getPillStatus } from "@/features/pills/pills.server"
import { startPillRuntime } from "@/features/processes/supervisor.server"

export const Route = createFileRoute("/api/cli/v1/pills/$pillId/start")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["runs:start"],
            "start pill runs"
          )
          const data = startPillSchema.parse(await readJsonBody(request))
          const pill = await getPillStatus({ pillId: params.pillId })

          return startPillRuntime({
            pillId: params.pillId,
            commandName: data.commandName ?? pill.defaultEnv,
            expiresAt: data.expiresAt,
            rotatePorts: data.rotatePorts,
            useCapsule: data.useCapsule,
            capsuleId: data.capsuleId,
          })
        }, id)
      },
    },
  },
})
