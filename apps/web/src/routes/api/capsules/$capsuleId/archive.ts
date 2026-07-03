import { createFileRoute } from "@tanstack/react-router"

import { verifyRequestSession } from "@/features/auth/session.server"
import { createCapsuleArchive } from "@/features/capsules/capsule-archive.server"

export const Route = createFileRoute("/api/capsules/$capsuleId/archive")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const session = await verifyRequestSession(
          request.headers.get("cookie")
        )
        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 })
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
