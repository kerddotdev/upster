export type EventDomain =
  | "pills"
  | "runs"
  | "sessions"
  | "connections"
  | "vault"
  | "capsules"

export type DomainEvent = {
  domain: EventDomain
  type: string
  id?: string
}

type Listener = (event: DomainEvent) => void

const listeners = new Set<Listener>()

export function publishEvent(event: DomainEvent) {
  listeners.forEach((listener) => listener(event))
}

export function subscribeEvents(listener: Listener) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
