import { createFileRoute } from "@tanstack/react-router"
import { pinCapsuleSchema } from "@upster/core"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { setCapsulePinned } from "@/features/capsules/capsule.server"

export const Route = createFileRoute("/api/cli/v1/capsules/$capsuleId/pin")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["capsules:write"],
            "pin capsules"
          )
          const data = pinCapsuleSchema.parse(await readJsonBody(request))

          return setCapsulePinned(params.capsuleId, data.pinned)
        }, id)
      },
    },
  },
})
