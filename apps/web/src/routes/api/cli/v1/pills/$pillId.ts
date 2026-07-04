import { createFileRoute } from "@tanstack/react-router"
import { updatePillSchema } from "@upster/core"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import {
  deletePill,
  getPillStatus,
  updatePill,
} from "@/features/pills/pills.server"

export const Route = createFileRoute("/api/cli/v1/pills/$pillId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["pills:read"],
            "read pill data"
          )
          return getPillStatus({ pillId: params.pillId })
        }, id)
      },
      PATCH: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(request, ["pills:write"], "update pills")
          const data = updatePillSchema.parse(await readJsonBody(request))

          return updatePill({ pillId: params.pillId, ...data })
        }, id)
      },
      DELETE: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["pills:delete"],
            "delete pills"
          )

          return deletePill({ pillId: params.pillId })
        }, id)
      },
    },
  },
})
