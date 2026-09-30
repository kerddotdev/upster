import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  getConnectionEndpointsFn,
  listConnectionsFn,
  listPairingLinksFn,
} from "@/features/connections/connection.functions"
import { getTailscaleStatusFn } from "@/features/tailscale/tailscale.functions"

export async function loadConnectionsPage() {
  const [connections, pairingLinks, endpoints, tailscale] = await Promise.all([
    listConnectionsFn(),
    listPairingLinksFn(),
    getConnectionEndpointsFn(),
    getTailscaleStatusFn(),
  ])

  return { connections, pairingLinks, endpoints, tailscale }
}

export type LoaderData = Awaited<ReturnType<typeof loadConnectionsPage>>
export type ConnectionRow = LoaderData["connections"][number]
export type PairingLinkRow = LoaderData["pairingLinks"][number]
export type EndpointRow = LoaderData["endpoints"][number]
export type TailscaleStatusRow = LoaderData["tailscale"]

export function useNow() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  return now
}

export function buildPairingUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/pair#token=${encodeURIComponent(token)}`
}

export async function copyText(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(message)
  } catch {
    toast.error("Could not copy to clipboard.")
  }
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatNullableDate(value: string | null) {
  return value ? formatDateTime(value) : "never"
}

export function formatCountdown(value: string, now: number) {
  const remaining = new Date(value).getTime() - now
  if (remaining <= 0) {
    return "Expired"
  }

  const totalSeconds = Math.ceil(remaining / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

export function deviceSummary(connection: ConnectionRow) {
  const browser = connection.metadata.browser ?? "Unknown browser"
  const os = connection.metadata.os
  const bits = [
    os ? `${browser} on ${os}` : browser,
    connection.metadata.device,
    connection.metadata.tailnetIdentity
      ? `paired by ${connection.metadata.tailnetIdentity}`
      : null,
    connection.remoteAddr,
    connection.connectedNow
      ? "Active now"
      : `Last seen ${formatNullableDate(connection.lastSeenAt)}`,
  ].filter(Boolean)

  return bits.join(" · ")
}
