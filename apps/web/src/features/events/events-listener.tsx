import { useEffect } from "react"
import { useRouter } from "@tanstack/react-router"

export function EventsListener() {
  const router = useRouter()

  useEffect(() => {
    const source = new EventSource("/api/events")

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as { domain?: string }
        if (event.domain === "hello") {
          return
        }
      } catch {
        return
      }

      void router.invalidate()
    }

    return () => {
      source.close()
    }
  }, [router])

  return null
}
