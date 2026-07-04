export function isAdminPassphraseAllowedForHost(host: string | null) {
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

export function isSessionKindAllowedForHost(kind: string, host: string | null) {
  return kind !== "dashboard" || isAdminPassphraseAllowedForHost(host)
}

function normalizeHostName(host: string) {
  if (host.startsWith("[")) {
    return (host.match(/^\[([^\]]+)\]/)?.[1] ?? host).toLowerCase()
  }

  return (host.split(":")[0] ?? host).toLowerCase()
}
