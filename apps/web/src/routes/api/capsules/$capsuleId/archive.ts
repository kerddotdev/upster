import { createFileRoute } from "@tanstack/react-router"

import { authorizeApiRequest } from "@/features/auth/api-scope.server"
import { createCapsuleArchive } from "@/features/capsules/capsule-archive.server"

export const Route = createFileRoute("/api/capsules/$capsuleId/archive")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const auth = await authorizeApiRequest(request, "capsules:read")
        if (!auth.ok) {
          return Response.json({ error: auth.message }, { status: auth.status })
        }

        const archive = await createCapsuleArchive(params.capsuleId)
        if (!archive) {
          return Response.json({ error: "Capsule not found." }, { status: 404 })
        }

        return new Response(archive.stream, {
          headers: {
            "Content-Type": "application/gzip",
            "Content-Disposition": `attachment; filename="${archive.filename}"`,
          },
        })
      },
    },
  },
})
