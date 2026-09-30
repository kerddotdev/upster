import { createFileRoute } from "@tanstack/react-router"

import {
  assertHumanCliActor,
  authenticateCliRequest,
} from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { deleteCloudflareVaultInteractive } from "@/features/secrets/vault-session.server"

export const Route = createFileRoute("/api/cli/v1/vault")({
  server: {
    handlers: {
      DELETE: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          const actor = await authenticateCliRequest(
            request,
            ["vault:delete"],
            "delete the Cloudflare Vault"
          )
          assertHumanCliActor(actor, "upster vault delete")

          return deleteCloudflareVaultInteractive({
            sessionId: actor.session.id,
            kind: actor.session.kind,
          })
        }, id)
      },
    },
  },
})
