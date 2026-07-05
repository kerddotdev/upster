import type { TailscaleStatus } from "@/features/tailscale/tailscale-control.server"

export type ConnectionEndpoint = {
  id: string
  label: string
  origin: string | null
  kind: "loopback" | "tailscale-https" | "tailscale-http" | "current"
  setupRequired: boolean
  current: boolean
}

function originFor(proto: string, host: string, port: number) {
  const defaultPort = proto === "https" ? 443 : 80
  return port === defaultPort
    ? `${proto}://${host}`
    : `${proto}://${host}:${port}`
}

export function buildConnectionEndpoints(
  status: TailscaleStatus,
  appPort: number
): Array<ConnectionEndpoint> {
  const endpoints: Array<ConnectionEndpoint> = [
    {
      id: "loopback",
      label: "This machine",
      origin: `http://127.0.0.1:${appPort}`,
      kind: "loopback",
      setupRequired: false,
      current: false,
    },
  ]

  const httpsOrigin =
    status.loggedIn && status.magicDnsName && status.serveHttpsActive
      ? originFor("https", status.magicDnsName, status.httpsPort)
      : null

  endpoints.push({
    id: "tailscale-https",
    label: "Tailscale HTTPS",
    origin: httpsOrigin,
    kind: "tailscale-https",
    setupRequired: httpsOrigin === null,
    current: false,
  })

  if (status.loggedIn && status.magicDnsName && status.serveHttpActive) {
    endpoints.push({
      id: "tailscale-http",
      label: "Tailscale HTTP",
      origin: originFor("http", status.magicDnsName, status.httpPort),
      kind: "tailscale-http",
      setupRequired: false,
      current: false,
    })
  }

  return endpoints
}

export function addCurrentRequestEndpoint(
  endpoints: Array<ConnectionEndpoint>,
  origin: string | null
) {
  if (!origin || endpoints.some((endpoint) => endpoint.origin === origin)) {
    return endpoints
  }

  return [
    ...endpoints,
    {
      id: "current",
      label: "Current origin",
      origin,
      kind: "current",
      setupRequired: false,
      current: true,
    } satisfies ConnectionEndpoint,
  ]
}
