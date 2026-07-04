export function getClientAddr(headers: Headers) {
  if (process.env.UPSTER_TRUST_PROXY !== "true") {
    return null
  }

  const forwardedFor = headers.get("x-forwarded-for")
  const firstHop = forwardedFor?.split(",")[0]?.trim()

  return firstHop || null
}
