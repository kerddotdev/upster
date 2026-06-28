import { createFileRoute } from "@tanstack/react-router"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { getVaultStatus } from "@/features/secrets/vault-session.server"

export const Route = createFileRoute("/api/cli/v1/vault/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["vault:status"],
            "read vault status"
          )

          return getVaultStatus()
        }, id)
      },
    },
  },
})
