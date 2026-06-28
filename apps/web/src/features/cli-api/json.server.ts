export async function readJsonBody(request: Request) {
  const text = await request.text()

  if (!text.trim()) {
    return {}
  }

  return JSON.parse(text) as unknown
}

export function getSessionCookie(request: Request) {
  return request.headers.get("cookie")
}
