import { createFileRoute } from "@tanstack/react-router"
import { vaultSaveSchema } from "@upster/core"

import {
  assertHumanCliActor,
  authenticateCliRequest,
} from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { saveCloudflareVaultInteractive } from "@/features/secrets/vault-session.server"

export const Route = createFileRoute("/api/cli/v1/vault/save")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          const actor = await authenticateCliRequest(
            request,
            ["vault:write"],
            "save the Cloudflare vault"
          )
          assertHumanCliActor(actor, "upster vault save")

          const data = vaultSaveSchema.parse(await readJsonBody(request))
          return saveCloudflareVaultInteractive({
            ...data,
            actorSessionId: actor.session.id,
          })
        }, id)
      },
    },
  },
})
