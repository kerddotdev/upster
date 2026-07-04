import { createFileRoute } from "@tanstack/react-router"
import { pruneCapsulesSchema } from "@upster/core"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { runPrune } from "@/features/capsules/capsule.server"

export const Route = createFileRoute(
  "/api/cli/v1/pills/$pillId/capsules/prune"
)({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["capsules:delete"],
            "prune capsules"
          )
          const data = pruneCapsulesSchema.parse(await readJsonBody(request))

          return runPrune(params.pillId, data.keep)
        }, id)
      },
    },
  },
})
