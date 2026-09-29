import { createFileRoute } from "@tanstack/react-router"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { deleteCapsuleVersion } from "@/features/capsules/capsule.server"

export const Route = createFileRoute("/api/cli/v1/capsules/$capsuleId")({
  server: {
    handlers: {
      DELETE: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          const actor = await authenticateCliRequest(
            request,
            ["capsules:delete"],
            "delete capsules"
          )
          await deleteCapsuleVersion(params.capsuleId, {
            sessionId: actor.session.id,
            kind: actor.session.kind,
          })

          return { capsuleId: params.capsuleId, deleted: true }
        }, id)
      },
    },
  },
})
