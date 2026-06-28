import {
  accessScopes,
  agentAllowedScopes,
  agentFullRuntimeScopes,
  humanOnlyScopes,
} from "./scopes"

export type AgentGuide = ReturnType<typeof getAgentGuide>

export function getAgentGuide() {
  return {
    version: 1,
    summary:
      "Upster agents use scoped bearer tokens against the local Upster control plane. Agents can operate pills, runs, logs, metrics, runtime status, and vault status when their token scopes allow it. Agents can never read Cloudflare secrets or unlock the vault.",
    defaultDashboardUrl: "http://127.0.0.1:3377",
    authModel: {
      tokenSources: ["--token", "--token-file", "UPSTER_TOKEN"],
      tokenFormat: "upst_<random>",
      storage:
        "The control plane stores only a token hash. The plaintext token is shown once when a human creates the session.",
      agentBoundary:
        "The security boundary for agents is the scoped capability token. A human admin token must not be given to an agent.",
    },
    scopes: accessScopes.map((scope) => ({
      scope,
      agentAllowed: (agentAllowedScopes as Array<string>).includes(scope),
      humanOnly: (humanOnlyScopes as Array<string>).includes(scope),
    })),
    presets: {
      agentFullRuntime: agentFullRuntimeScopes,
    },
    agentSafeCommands: [
      "upster status --json",
      "upster agent guide --json",
      "upster agent doctor --json",
      "upster vault status --json",
      "upster pills list --json",
      "upster pills get <pill> --json",
      "upster pills add --input pill.json --json",
      "upster pills delete <pill> --json",
      "upster pills run <pill> --json",
      "upster pills stop <pill> --json",
      "upster runs get <runId> --json",
      "upster runs logs <runId> --json --output run.output",
      "upster runs metrics <runId> --json --output metrics.output",
    ],
    humanOnlyCommands: [
      "upster auth setup",
      "upster auth login",
      "upster vault save",
      "upster vault unlock",
      "upster vault delete",
      "upster agents create --label <label> --ttl 24h --scopes <scopes>",
      "upster sessions revoke <id>",
    ],
    outputRules: {
      json: "JSON mode always returns an envelope. Failures include reason, cause, remediation, and whether human action is required.",
      outputFile:
        "--output writes the full envelope or stream payload to a file. Existing files require --force.",
      sensitiveData:
        "Outputs must never include passphrases, bearer tokens after initial creation, vault ciphertext, Cloudflare API tokens, decrypted configs, or command env values.",
    },
    commonErrors: [
      {
        code: "AUTH_TOKEN_MISSING",
        meaning: "No bearer token or authenticated dashboard session was sent.",
        agentAction:
          "Ask the human operator to create an agent token and pass it with --token, --token-file, or UPSTER_TOKEN.",
      },
      {
        code: "MISSING_SCOPE",
        meaning: "The token is valid but does not include the needed scope.",
        agentAction:
          "Report the requiredScopes and currentScopes fields to the human operator.",
      },
      {
        code: "VAULT_LOCKED",
        meaning:
          "A Cloudflare operation needs a human-unlocked vault session in the control plane.",
        agentAction:
          "Ask the human operator to run upster vault unlock. Do not ask for the passphrase.",
      },
      {
        code: "CONTROL_PLANE_UNAVAILABLE",
        meaning: "The local dashboard/control plane is not reachable.",
        agentAction:
          "Ask the human operator to start Upster, then retry upster agent doctor.",
      },
      {
        code: "HUMAN_APPROVAL_REQUIRED",
        meaning:
          "The requested operation is intentionally restricted to interactive human use.",
        agentAction:
          "Report the remediation command to the human operator and wait for confirmation.",
      },
    ],
    examples: {
      createToken:
        "upster agents create --label codex --ttl 24h --scopes pills:read,runs:start,runs:stop,logs:read,metrics:read,vault:status",
      listPills: "UPSTER_TOKEN=upst_xxx upster pills list --json",
      startPill: "UPSTER_TOKEN=upst_xxx upster pills run my-pill --json",
      diagnose: "UPSTER_TOKEN=upst_xxx upster agent doctor --json",
    },
  }
}

export function renderAgentGuideMarkdown() {
  const guide = getAgentGuide()

  return [
    "# Upster agent guide",
    "",
    guide.summary,
    "",
    "## Authentication",
    "",
    `Default control plane: ${guide.defaultDashboardUrl}`,
    "",
    "Token sources, in priority order:",
    ...guide.authModel.tokenSources.map((source) => `- ${source}`),
    "",
    guide.authModel.storage,
    guide.authModel.agentBoundary,
    "",
    "## Agent-safe commands",
    "",
    ...guide.agentSafeCommands.map((command) => `- ${command}`),
    "",
    "## Human-only commands",
    "",
    ...guide.humanOnlyCommands.map((command) => `- ${command}`),
    "",
    "## Scopes",
    "",
    ...guide.scopes.map((entry) => {
      const marker = entry.agentAllowed ? "agent" : "human-only"
      return `- ${entry.scope}: ${marker}`
    }),
    "",
    "## JSON and output files",
    "",
    `- ${guide.outputRules.json}`,
    `- ${guide.outputRules.outputFile}`,
    `- ${guide.outputRules.sensitiveData}`,
    "",
    "## Common errors",
    "",
    ...guide.commonErrors.flatMap((error) => [
      `- ${error.code}`,
      `  Meaning: ${error.meaning}`,
      `  Agent action: ${error.agentAction}`,
    ]),
    "",
    "## Examples",
    "",
    ...Object.values(guide.examples).map((example) => `- ${example}`),
    "",
  ].join("\n")
}

export function renderCliHelp() {
  return [
    "Upster CLI",
    "",
    "Usage:",
    "  upster <command> [options]",
    "",
    "Global options:",
    "  --json                    Return an API envelope as JSON",
    "  --input <file|->          Read JSON input from a file or stdin",
    "  --output <file>           Write the full output payload to a file",
    "  --force                   Allow --output to overwrite an existing file",
    "  --dashboard-url <url>     Override the dashboard/control plane URL",
    "  --token <token>           Use a bearer token for this command",
    "  --token-file <file>       Read a bearer token from a file",
    "  --no-color                Disable terminal color",
    "  --help                    Show this help",
    "",
    "Auth model:",
    "  The CLI talks to the local Upster control plane, not directly to the runtime.",
    "  Human users sign in with the admin passphrase. Agents use scoped bearer tokens.",
    "  Agents must never receive a human admin token or a vault passphrase.",
    "",
    "Human-only commands:",
    "  upster auth setup",
    "  upster auth login",
    "  upster auth logout",
    "  upster vault save",
    "  upster vault unlock",
    "  upster vault lock",
    "  upster vault delete",
    "  upster agents create --label <label> --ttl <duration> --scopes <scopes>",
    "  upster sessions revoke <id>",
    "",
    "Agent-safe commands:",
    "  upster status --json",
    "  upster agent guide --json",
    "  upster agent doctor --json",
    "  upster vault status --json",
    "  upster pills list --json",
    "  upster pills get <pill> --json",
    "  upster pills add --input pill.json --json",
    "  upster pills delete <pill> --json",
    "  upster pills run <pill> --json",
    "  upster pills stop <pill> --json",
    "  upster runs get <runId> --json",
    "  upster runs logs <runId> --json --output run.output",
    "  upster runs metrics <runId> --json --output metrics.output",
    "",
    "JSON input and output:",
    "  JSON mode always returns { ok, data|error, meta }.",
    "  Error envelopes include reason, cause, remediation, humanActionRequired, and scope fields when relevant.",
    "  Sensitive commands such as setup, login, vault save, and vault unlock reject --input and require interactive human input.",
    "  --output writes the full envelope or stream payload to a file. Existing files require --force.",
    "",
    "Scope list:",
    ...accessScopes.map((scope) => {
      const marker = (agentAllowedScopes as Array<string>).includes(scope)
        ? "agent allowed"
        : "human-only"
      return `  ${scope.padEnd(16)} ${marker}`
    }),
    "",
    "Diagnostics:",
    "  Run upster agent doctor --json first when an agent sees an auth, scope, vault, runtime, or connectivity failure.",
    "  Run upster agent guide for detailed agent instructions and common error remediation.",
    "",
    "Common errors:",
    "  AUTH_TOKEN_MISSING       Provide --token, --token-file, or UPSTER_TOKEN",
    "  AUTH_TOKEN_EXPIRED       Ask the human operator for a new scoped token",
    "  AUTH_TOKEN_REVOKED       Ask the human operator whether access should be restored",
    "  MISSING_SCOPE            Ask for a token with the requiredScopes shown in the error",
    "  VAULT_LOCKED             Ask the human operator to run upster vault unlock",
    "  CONTROL_PLANE_UNAVAILABLE Ask the human operator to start Upster",
    "  HUMAN_APPROVAL_REQUIRED Ask the human operator to run the remediation command",
    "",
  ].join("\n")
}
