import { createFileRoute } from "@tanstack/react-router"
import { UpsterApiError, adminScopes } from "@upster/core"

import { createBearerSession } from "@/features/cli-api/auth.server"
import { readJsonBody } from "@/features/cli-api/json.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import { createAdmin, hasAdmin } from "@/features/auth/auth.server"

export const Route = createFileRoute("/api/cli/v1/auth/setup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          const body = (await readJsonBody(request)) as { passphrase?: string }
          const passphrase = body.passphrase ?? ""

          if (await hasAdmin()) {
            throw new UpsterApiError({
              status: 409,
              code: "ADMIN_ALREADY_EXISTS",
              message: "Upster admin setup has already been completed.",
              reason:
                "Only the first setup request can create the admin passphrase.",
              cause:
                "The admin_users table already contains the local admin account.",
              remediation:
                "Run upster auth login interactively, or ask the current operator for a scoped agent token.",
              humanActionRequired: true,
              docsCommand: "upster agent guide",
            })
          }

          if (passphrase.length < 12 || passphrase.length > 1024) {
            throw new UpsterApiError({
              status: 400,
              code: "INVALID_PASSPHRASE",
              message: "The admin passphrase is not valid.",
              reason: "The passphrase must be between 12 and 1024 characters.",
              cause:
                "The submitted setup payload did not include an acceptable passphrase.",
              remediation:
                "Run upster auth setup interactively and enter a strong admin passphrase.",
              humanActionRequired: true,
              docsCommand: "upster --help",
            })
          }

          await createAdmin(passphrase)
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
