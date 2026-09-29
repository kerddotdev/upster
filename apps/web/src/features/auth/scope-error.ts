import type { AccessScope } from "@upster/core"

const SCOPE_DENIED_PREFIX = "Missing permission: "

export class ScopeDeniedError extends Error {
  readonly requiredScopes: Array<AccessScope>

  constructor(requiredScopes: Array<AccessScope>) {
    super(`${SCOPE_DENIED_PREFIX}${requiredScopes.join(", ")}`)
    this.name = "ScopeDeniedError"
    this.requiredScopes = requiredScopes
  }
}

export function isScopeDeniedMessage(message: string | null | undefined) {
  return typeof message === "string" && message.startsWith(SCOPE_DENIED_PREFIX)
}
