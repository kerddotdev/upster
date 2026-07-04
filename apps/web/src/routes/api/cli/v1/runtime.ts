import { createFileRoute } from "@tanstack/react-router"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { getRuntimeControlPlaneStatus } from "@/features/runtime/instance.server"

export const Route = createFileRoute("/api/cli/v1/runtime")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["runtime:read"],
            "read runtime data"
          )

          return getRuntimeControlPlaneStatus()
        }, id)
      },
    },
  },
})
