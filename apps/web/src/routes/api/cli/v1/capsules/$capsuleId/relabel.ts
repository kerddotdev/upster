import { createFileRoute } from "@tanstack/react-router"
import { relabelCapsuleSchema } from "@upster/core"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { relabelCapsule } from "@/features/capsules/capsule.server"

export const Route = createFileRoute("/api/cli/v1/capsules/$capsuleId/relabel")(
  {
    server: {
      handlers: {
        POST: async ({ params, request }) => {
          const id = requestId()

          return handleCliRoute(async () => {
            await authenticateCliRequest(
              request,
              ["capsules:write"],
              "relabel capsules"
            )
            const data = relabelCapsuleSchema.parse(await readJsonBody(request))

            return relabelCapsule(params.capsuleId, data.label)
          }, id)
        },
      },
    },
  }
)
