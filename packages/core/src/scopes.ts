export const accessScopes = [
  "pills:read",
  "pills:write",
  "pills:delete",
  "capsules:read",
  "capsules:write",
  "capsules:delete",
  "runs:start",
  "runs:stop",
  "logs:read",
  "metrics:read",
  "runtime:read",
  "vault:status",
  "sessions:read",
  "sessions:revoke",
  "vault:write",
  "vault:unlock",
  "vault:delete",
] as const

export type AccessScope = (typeof accessScopes)[number]

export const agentAllowedScopes = [
  "pills:read",
  "pills:write",
  "pills:delete",
  "capsules:read",
  "capsules:write",
  "capsules:delete",
  "runs:start",
  "runs:stop",
  "logs:read",
  "metrics:read",
  "runtime:read",
  "vault:status",
] satisfies Array<AccessScope>

export const agentFullRuntimeScopes = [...agentAllowedScopes]

export const humanOnlyScopes = [
  "sessions:read",
  "sessions:revoke",
  "vault:write",
  "vault:unlock",
  "vault:delete",
] satisfies Array<AccessScope>

export const adminScopes = [...accessScopes]

export function parseScopes(value: string | Array<string>) {
  const entries = Array.isArray(value)
    ? value
    : value
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean)

  return entries.map((scope) => {
    if (!isAccessScope(scope)) {
      throw new Error(`Unknown Upster scope: ${scope}`)
    }

    return scope
  })
}

export function isAccessScope(value: string): value is AccessScope {
  return accessScopes.includes(value as AccessScope)
}

export function scopesIncludeAll(
  currentScopes: Array<AccessScope>,
  requiredScopes: Array<AccessScope>
) {
  return requiredScopes.every((scope) => currentScopes.includes(scope))
}
