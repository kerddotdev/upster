import { UpsterApiError } from "@upster/core"

export async function readJsonBody(request: Request) {
  const text = await request.text()

  if (!text.trim()) {
    return {}
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new UpsterApiError({
      status: 400,
      code: "INVALID_INPUT",
      message: "The request body is not valid JSON.",
      reason: "The CLI sent a body that could not be parsed as JSON.",
      cause: "The JSON payload is malformed or truncated.",
      remediation:
        "Send a well-formed JSON body. When using --input, check the file or piped content.",
      humanActionRequired: false,
      docsCommand: "upster --help",
    })
  }
}

export function getSessionCookie(request: Request) {
  return request.headers.get("cookie")
}
