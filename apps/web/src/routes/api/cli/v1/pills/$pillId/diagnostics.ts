import { createFileRoute } from "@tanstack/react-router"

import { authenticateCliRequest } from "@/features/cli-api/auth.server"
import { handleCliRoute, requestId } from "@/features/cli-api/responses.server"
import {
  clearPillDiagnostics,
  getPillDiagnostics,
} from "@/features/pills/diagnostics.server"

export const Route = createFileRoute("/api/cli/v1/pills/$pillId/diagnostics")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["pills:read"],
            "read pill diagnostics"
          )
          return getPillDiagnostics(params.pillId)
        }, id)
      },
      POST: async ({ params, request }) => {
        const id = requestId()

        return handleCliRoute(async () => {
          await authenticateCliRequest(
            request,
            ["pills:delete"],
            "clear pill diagnostics"
          )
          return clearPillDiagnostics(params.pillId)
        }, id)
      },
    },
  },
})
