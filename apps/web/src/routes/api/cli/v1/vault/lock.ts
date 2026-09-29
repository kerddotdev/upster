import { createFileRoute } from "@tanstack/react-router"

import {
  assertHumanCliActor,
  authenticateCliRequest,
} from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import {
  getVaultStatus,
  lockCloudflareVault,
} from "@/features/secrets/vault-session.server"

export const Route = createFileRoute("/api/cli/v1/vault/lock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          const actor = await authenticateCliRequest(
            request,
            ["vault:unlock"],
            "lock the Cloudflare vault"
          )
          assertHumanCliActor(actor, "upster vault lock")

          const vaultActor = {
            sessionId: actor.session.id,
            kind: actor.session.kind,
          }
          await lockCloudflareVault(vaultActor)
          return getVaultStatus(vaultActor)
        }, id)
      },
    },
  },
})
