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
  kind: "loopback" | "tailscale-https" | "current"
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
      setupRequired: true,
      stale: false,
      current: false,
    })
    return endpoints
  }

  endpoints.push({
    id: "tailscale-https",
    label: "Tailscale HTTPS",
    origin: `https://${status.magicDnsName}:${status.servePort}`,
    kind: "tailscale-https",
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
      setupRequired: false,
      stale: false,
      current: true,
    } satisfies ConnectionEndpoint,
  ]
}
