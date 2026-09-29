import {
  accessScopes,
  connectionScopePresets,
  type AccessScope,
  type ConnectionScopePreset,
} from "@upster/core"

export const presetMeta: Record<
  ConnectionScopePreset,
  { label: string; description: string }
> = {
  viewer: {
    label: "Viewer",
    description: "Read pills, capsules, logs, metrics, and vault status.",
  },
  operator: {
    label: "Operator",
    description: "Everything a viewer can do, plus edit pills and start runs.",
  },
  fullAdmin: {
    label: "Full admin",
    description: "Full control, including vault, sessions, and connections.",
  },
}

const DOMAIN_LABELS: Record<string, string> = {
  pills: "Pills",
  capsules: "Capsules",
  runs: "Runs",
  logs: "Logs",
  metrics: "Metrics",
  runtime: "Runtime",
  settings: "Settings",
  vault: "Vault",
  sessions: "Sessions",
  connections: "Connections",
}

export type ScopeGroup = {
  domain: string
  label: string
  scopes: Array<AccessScope>
}

export const scopeGroups: Array<ScopeGroup> = buildScopeGroups()

function buildScopeGroups(): Array<ScopeGroup> {
  const order: Array<string> = []
  const byDomain = new Map<string, Array<AccessScope>>()

  for (const scope of accessScopes) {
    const domain = scope.split(":")[0]
    if (!byDomain.has(domain)) {
      byDomain.set(domain, [])
      order.push(domain)
    }
    byDomain.get(domain)?.push(scope)
  }

  return order.map((domain) => ({
    domain,
    label: DOMAIN_LABELS[domain] ?? domain,
    scopes: byDomain.get(domain) ?? [],
  }))
}

export function matchPreset(
  scopes: Array<AccessScope>
): ConnectionScopePreset | null {
  const target = [...scopes].sort()

  for (const [name, presetScopes] of Object.entries(connectionScopePresets)) {
    const preset = [...presetScopes].sort()
    if (
      preset.length === target.length &&
      preset.every((scope, index) => scope === target[index])
    ) {
      return name as ConnectionScopePreset
    }
  }

  return null
}

export function describeScopes(scopes: Array<AccessScope>): string {
  const preset = matchPreset(scopes)
  if (preset) {
    return presetMeta[preset].label
  }

  return `${scopes.length} ${scopes.length === 1 ? "scope" : "scopes"}`
}
