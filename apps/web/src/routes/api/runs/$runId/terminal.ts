import { createFileRoute } from "@tanstack/react-router"

import { getRunLogs } from "@/db/repositories.server"
import { authorizeApiRequest } from "@/features/auth/api-scope.server"
import { subscribeRunLogs } from "@/features/terminal/log-bus.server"

function formatSse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`
}

export const Route = createFileRoute("/api/runs/$runId/terminal")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const auth = await authorizeApiRequest(request, "logs:read")
        if (!auth.ok) {
          return new Response(auth.message, { status: auth.status })
        }

        const encoder = new TextEncoder()

        const stream = new ReadableStream({
          async start(controller) {
            let closed = false
            let unsubscribe: (() => void) | null = null

            const close = () => {
              if (closed) {
                return
              }

              closed = true
              unsubscribe?.()
              unsubscribe = null

              try {
                controller.close()
              } catch {}
            }

            const enqueue = (data: unknown) => {
              if (closed) {
                return
              }

              try {
                controller.enqueue(encoder.encode(formatSse(data)))
              } catch {
                close()
              }
            }

            request.signal.addEventListener("abort", close, { once: true })

            const initialLogs = await getRunLogs(params.runId)

            for (const log of initialLogs) {
              enqueue(log)
            }

            unsubscribe = subscribeRunLogs(params.runId, (log) => {
              enqueue(log)
            })

            if (request.signal.aborted) {
              close()
            }
          },
        })

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        })
      },
    },
  },
})
