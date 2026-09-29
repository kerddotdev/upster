export type RequestOriginInfo = {
  host: string | null
  cameThroughProxy: boolean
  tailnetIdentity: string | null
}

const FORWARDING_HEADERS = [
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-forwarded-host",
  "forwarded",
]

const TAILNET_IDENTITY_HEADER = "tailscale-user-login"

export function readTailnetIdentity(
  getHeader: (name: string) => string | null | undefined,
  cameThroughProxy: boolean
) {
  if (!cameThroughProxy) {
    return null
  }

  const value = getHeader(TAILNET_IDENTITY_HEADER)?.trim()
  return value ? value : null
}

export function isLocalHostName(host: string | null) {
  if (!host) {
    return false
  }

  const hostname = normalizeHostName(host)
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "upster.upster.orb.local" ||
    hostname.startsWith("127.")
  )
}

export function isLoopbackBindHost(bindHost: string | null | undefined) {
  const value = (bindHost ?? "").trim().toLowerCase()
  if (value === "") {
    return true
  }

  return value === "localhost" || value === "::1" || value.startsWith("127.")
}

export function readRequestOriginInfo(
  getHeader: (name: string) => string | null | undefined
): RequestOriginInfo {
  const cameThroughProxy = FORWARDING_HEADERS.some((name) =>
    Boolean(getHeader(name))
  )

  return {
    host: getHeader("host") ?? null,
    cameThroughProxy,
    tailnetIdentity: readTailnetIdentity(getHeader, cameThroughProxy),
  }
}

export function readRequestOriginInfoFromHeaders(
  headers: Headers
): RequestOriginInfo {
  return readRequestOriginInfo((name) => headers.get(name))
}

export function isPrivilegedLocalRequest(
  info: RequestOriginInfo,
  bindHost: string | null | undefined
) {
  if (!isLoopbackBindHost(bindHost)) {
    return false
  }

  if (info.cameThroughProxy) {
    return false
  }

  return isLocalHostName(info.host)
}

export function isTailnetIdentityMismatch(
  storedIdentity: string | null,
  info: RequestOriginInfo
) {
  if (!storedIdentity || !info.cameThroughProxy) {
    return false
  }

  return info.tailnetIdentity !== storedIdentity
}

export function isSessionKindAllowedForRequest(
  kind: string,
  info: RequestOriginInfo,
  bindHost: string | null | undefined
) {
  return kind !== "dashboard" || isPrivilegedLocalRequest(info, bindHost)
}

function normalizeHostName(host: string) {
  if (host.startsWith("[")) {
    return (host.match(/^\[([^\]]+)\]/)?.[1] ?? host).toLowerCase()
  }

  return (host.split(":")[0] ?? host).toLowerCase()
}
