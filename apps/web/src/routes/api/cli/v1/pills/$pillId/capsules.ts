import { createFileRoute } from "@tanstack/react-router"
import { buildCapsuleSchema } from "@upster/core"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import {
  buildCapsule,
  getCapsuleInfo,
} from "@/features/capsules/capsule.server"

export const Route = createFileRoute("/api/cli/v1/pills/$pillId/capsules")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["capsules:read"],
            "read capsules"
          )
          return getCapsuleInfo(params.pillId)
        }, id)
      },
      POST: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          const actor = await authenticateCliRequest(
            request,
            ["capsules:write"],
            "build capsules"
          )
          const data = buildCapsuleSchema.parse(await readJsonBody(request))

          return buildCapsule(
            { pillId: params.pillId, ...data },
            { sessionId: actor.session.id, kind: actor.session.kind }
          )
        }, id)
      },
    },
  },
})
