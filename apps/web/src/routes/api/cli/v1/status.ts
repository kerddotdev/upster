import { createFileRoute } from "@tanstack/react-router"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { getRuntimeControlPlaneStatus } from "@/features/runtime/instance.server"
import { getVaultStatus } from "@/features/secrets/vault-session.server"

export const Route = createFileRoute("/api/cli/v1/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          const actor = await authenticateCliRequest(
            request,
            ["runtime:read"],
            "read runtime status"
          )

          const canReadVault = actor.scopes.includes("vault:status")

          return {
            controlPlane: await getRuntimeControlPlaneStatus(),
            vault: canReadVault ? await getVaultStatus() : null,
            session: {
              id: actor.session.id,
              kind: actor.session.kind,
              label: actor.session.label,
              scopes: actor.session.scopes,
              expiresAt: actor.session.expiresAt,
              revokedAt: actor.session.revokedAt,
            },
          }
        }, id)
      },
    },
  },
})
