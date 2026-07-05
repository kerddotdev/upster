import { createFileRoute } from "@tanstack/react-router"
import { scopesIncludeAll, type AccessScope } from "@upster/core"

import { authorizeApiRequest } from "@/features/auth/api-scope.server"
import {
  subscribeEvents,
  type EventDomain,
} from "@/features/events/event-bus.server"

function formatSse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`
}

const EVENT_DOMAIN_SCOPES: Record<EventDomain, AccessScope> = {
  pills: "pills:read",
  runs: "pills:read",
  capsules: "capsules:read",
  sessions: "sessions:read",
  connections: "connections:read",
  vault: "vault:status",
}

function canReadEventDomain(
  scopes: Array<AccessScope>,
  domain: EventDomain
): boolean {
  const required = EVENT_DOMAIN_SCOPES[domain]
  return !required || scopesIncludeAll(scopes, [required])
}

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorizeApiRequest(request)
        if (!auth.ok) {
          return new Response(auth.message, { status: auth.status })
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
              if (canReadEventDomain(auth.session.scopes, event.domain)) {
                enqueue(event)
              }
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
