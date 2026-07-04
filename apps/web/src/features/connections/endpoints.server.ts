import { readFile } from "node:fs/promises"

import { z } from "zod"

const tailscaleStatusSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  magicDnsName: z.string().min(1),
  tailscaleIps: z.array(z.string().min(1)),
  servePort: z.number().int().positive(),
  appPort: z.number().int().positive(),
  lanIps: z.array(z.string().min(1)),
})

export type TailscaleStatus = z.infer<typeof tailscaleStatusSchema>

export type ConnectionEndpoint = {
  id: string
  label: string
  origin: string | null
  kind: "loopback" | "lan" | "tailscale-ip" | "tailscale-https" | "current"
  requiresBindHost: boolean
  setupRequired: boolean
  stale: boolean
  current: boolean
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000

export async function readTailscaleStatusFile(path: string) {
  try {
    const raw = await readFile(path, "utf-8")
    return tailscaleStatusSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export function buildConnectionEndpoints(
  status: TailscaleStatus | null,
  appPort: number
): Array<ConnectionEndpoint> {
  const stale = status
    ? Date.now() - new Date(status.generatedAt).getTime() > STALE_AFTER_MS
    : false
  const effectiveAppPort = status?.appPort ?? appPort
  const endpoints: Array<ConnectionEndpoint> = [
    {
      id: "loopback",
      label: "This machine",
      origin: `http://127.0.0.1:${effectiveAppPort}`,
      kind: "loopback",
      requiresBindHost: false,
      setupRequired: false,
      stale,
      current: false,
    },
  ]

  if (!status) {
    endpoints.push({
      id: "tailscale-https",
      label: "Tailscale HTTPS",
      origin: null,
      kind: "tailscale-https",
      requiresBindHost: false,
      setupRequired: true,
      stale: false,
      current: false,
    })
    return endpoints
  }

  for (const ip of status.lanIps) {
    endpoints.push({
      id: `lan-${ip}`,
      label: "Local network",
      origin: `http://${ip}:${effectiveAppPort}`,
      kind: "lan",
      requiresBindHost: true,
      setupRequired: false,
      stale,
      current: false,
    })
  }

  for (const ip of status.tailscaleIps.filter((value) => !value.includes(":"))) {
    endpoints.push({
      id: `tailscale-ip-${ip}`,
      label: "Tailscale IP",
      origin: `http://${ip}:${effectiveAppPort}`,
      kind: "tailscale-ip",
      requiresBindHost: true,
      setupRequired: false,
      stale,
      current: false,
    })
  }

  endpoints.push({
    id: "tailscale-https",
    label: "Tailscale HTTPS",
    origin: `https://${status.magicDnsName}:${status.servePort}`,
    kind: "tailscale-https",
    requiresBindHost: false,
    setupRequired: false,
    stale,
    current: false,
  })

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
      requiresBindHost: false,
      setupRequired: false,
      stale: false,
      current: true,
    } satisfies ConnectionEndpoint,
  ]
}
