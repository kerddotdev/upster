import { createFileRoute } from "@tanstack/react-router"
import { createPillSchema } from "@upster/core"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { createPill, getPills } from "@/features/pills/pills.server"

export const Route = createFileRoute("/api/cli/v1/pills")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(request, ["pills:read"], "list pills")
          return getPills()
        }, id)
      },
      POST: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(request, ["pills:write"], "create pills")
          const data = createPillSchema.parse(await readJsonBody(request))

          return createPill(data)
        }, id)
      },
    },
  },
})
