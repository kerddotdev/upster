import { useEffect, useState } from "react"

const LOCAL_HOSTNAMES = new Set(["localhost", "::1", "upster.upster.orb.local"])

export function isRemoteHostname(hostname: string) {
  const normalized = hostname.toLowerCase()
  if (LOCAL_HOSTNAMES.has(normalized) || normalized.startsWith("127.")) {
    return false
  }
  return true
}

export function useIsRemoteEnvironment() {
  const [remote, setRemote] = useState(false)

  useEffect(() => {
    setRemote(isRemoteHostname(window.location.hostname))
  }, [])

  return remote
}
