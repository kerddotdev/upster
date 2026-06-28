import { createFileRoute } from "@tanstack/react-router"
import { UpsterApiError, adminScopes } from "@upster/core"

import { createBearerSession } from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { verifyAdmin } from "@/features/auth/auth.server"

export const Route = createFileRoute("/api/cli/v1/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          const body = (await readJsonBody(request)) as { passphrase?: string }

          if (!(await verifyAdmin(body.passphrase ?? ""))) {
            throw new UpsterApiError({
              status: 401,
              code: "INVALID_ADMIN_PASSPHRASE",
              message: "The admin passphrase is invalid.",
              reason:
                "The submitted passphrase did not verify against the stored admin verifier.",
              cause:
                "The passphrase may be mistyped, or this may not be the operator who owns this Upster instance.",
              remediation:
                "Run upster auth login interactively and enter the correct admin passphrase. Agents must ask the human operator for a scoped token instead.",
              humanActionRequired: true,
              docsCommand: "upster agent guide",
            })
          }

          return createBearerSession({
            kind: "cli",
            subject: "admin",
            label: "CLI",
            scopes: adminScopes,
            request,
          })
        }, id)
      },
    },
  },
})
