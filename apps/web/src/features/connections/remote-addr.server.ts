export function getClientAddr(
  headers: Headers,
  trustProxy = process.env.UPSTER_TRUST_PROXY === "true"
) {
  if (!trustProxy) {
    return null
  }

  const forwardedFor = headers.get("x-forwarded-for")
  const firstHop = forwardedFor?.split(",")[0]?.trim()

  return firstHop || null
}
