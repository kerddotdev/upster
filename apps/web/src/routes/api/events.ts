import { createFileRoute } from "@tanstack/react-router"

import { readRequestOriginInfoFromHeaders } from "@/features/auth/admin-origin"
import { verifyRequestSession } from "@/features/auth/session.server"
import { subscribeEvents } from "@/features/events/event-bus.server"

function formatSse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`
}

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await verifyRequestSession(
          request.headers.get("cookie"),
          readRequestOriginInfoFromHeaders(request.headers)
        )
        if (!session) {
          return new Response("Unauthorized", { status: 401 })
        }

        const encoder = new TextEncoder()

        const stream = new ReadableStream({
          start(controller) {
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

            enqueue({ domain: "hello", type: "connected" })

            unsubscribe = subscribeEvents((event) => {
              enqueue(event)
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
