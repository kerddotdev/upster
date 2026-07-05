export function getClientAddr(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")
  const firstHop = forwardedFor?.split(",")[0]?.trim()

  return firstHop || null
}
