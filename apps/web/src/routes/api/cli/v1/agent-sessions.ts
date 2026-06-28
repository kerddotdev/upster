import { createFileRoute } from "@tanstack/react-router"
import { createAgentSessionSchema } from "@upster/core"

import {
  assertHumanCliActor,
  authenticateCliRequest,
  createBearerSession,
  validateAgentScopes,
} from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"

export const Route = createFileRoute("/api/cli/v1/agent-sessions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          const actor = await authenticateCliRequest(
            request,
            ["sessions:revoke"],
            "create scoped agent sessions"
          )
          assertHumanCliActor(actor, "upster agents create")

          const data = createAgentSessionSchema.parse(
            await readJsonBody(request)
          )
          validateAgentScopes(data.scopes)

          return createBearerSession({
            kind: "agent",
            subject: data.label,
            label: data.label,
            scopes: data.scopes,
            ttlSeconds: data.ttlSeconds,
            request,
            metadata: {
              createdBySessionId: actor.session.id,
            },
          })
        }, id)
      },
    },
  },
})
