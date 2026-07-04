import { createFileRoute } from "@tanstack/react-router"
import { vaultUnlockSchema } from "@upster/core"

import {
  assertHumanCliActor,
  authenticateCliRequest,
} from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { unlockCloudflareVault } from "@/features/secrets/vault-session.server"

export const Route = createFileRoute("/api/cli/v1/vault/unlock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          const actor = await authenticateCliRequest(
            request,
            ["vault:unlock"],
            "unlock the Cloudflare vault"
          )
          assertHumanCliActor(actor, "upster vault unlock")

          const data = vaultUnlockSchema.parse(await readJsonBody(request))
          return unlockCloudflareVault({
            ...data,
            actorSessionId: actor.session.id,
          })
        }, id)
      },
    },
  },
})
