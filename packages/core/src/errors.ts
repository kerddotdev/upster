import type { AccessScope } from "./scopes"

export type AgentErrorInput = {
  code: string
  message: string
  reason: string
  cause: string
  remediation: string
  humanActionRequired: boolean
  requiredScopes?: Array<string>
  currentScopes?: Array<string>
  docsCommand?: string
  details?: unknown
}

export class UpsterApiError extends Error {
  readonly code: string
  readonly reason: string
  readonly causeText: string
  readonly remediation: string
  readonly humanActionRequired: boolean
  readonly requiredScopes?: Array<string>
  readonly currentScopes?: Array<string>
  readonly docsCommand?: string
  readonly details?: unknown
  readonly status: number

  constructor(input: AgentErrorInput & { status?: number }) {
    super(input.message)
    this.name = "UpsterApiError"
    this.code = input.code
    this.reason = input.reason
    this.causeText = input.cause
    this.remediation = input.remediation
    this.humanActionRequired = input.humanActionRequired
    this.requiredScopes = input.requiredScopes
    this.currentScopes = input.currentScopes
    this.docsCommand = input.docsCommand
    this.details = input.details
    this.status = input.status ?? 400
  }

  toError() {
    return {
      code: this.code,
      message: this.message,
      reason: this.reason,
      cause: this.causeText,
      remediation: this.remediation,
      humanActionRequired: this.humanActionRequired,
      requiredScopes: this.requiredScopes,
      currentScopes: this.currentScopes,
      docsCommand: this.docsCommand,
      details: this.details,
    }
  }
}

export function missingTokenError() {
  return new UpsterApiError({
    status: 401,
    code: "AUTH_TOKEN_MISSING",
    message: "No Upster access token was provided.",
    reason:
      "Protected CLI API routes require a bearer token or an authenticated dashboard session cookie.",
    cause:
      "The request did not include an Authorization header with an Upster token.",
    remediation:
      "Ask the human operator to run upster auth login or upster agents create, then pass the token with --token, --token-file, or UPSTER_TOKEN.",
    humanActionRequired: true,
    docsCommand: "upster agent guide",
  })
}

export function invalidTokenError() {
  return new UpsterApiError({
    status: 401,
    code: "AUTH_TOKEN_INVALID",
    message: "The Upster access token is not valid.",
    reason:
      "The control plane could not match the bearer token to an active Upster session.",
    cause:
      "The token may be mistyped, expired, revoked, from another Upster instance, or not an Upster token.",
    remediation:
      "Ask the human operator to create a fresh scoped agent token and retry with that token.",
    humanActionRequired: true,
    docsCommand: "upster agent guide",
  })
}

export function expiredTokenError() {
  return new UpsterApiError({
    status: 401,
    code: "AUTH_TOKEN_EXPIRED",
    message: "The Upster access token has expired.",
    reason: "The session expiry time is in the past.",
    cause:
      "The token TTL elapsed before this request reached the Upster control plane.",
    remediation:
      "Ask the human operator to create a new scoped agent token with an appropriate TTL.",
    humanActionRequired: true,
    docsCommand: "upster agent guide",
  })
}

export function revokedTokenError() {
  return new UpsterApiError({
    status: 401,
    code: "AUTH_TOKEN_REVOKED",
    message: "The Upster access token has been revoked.",
    reason: "The matching Upster session has a revoked timestamp.",
    cause:
      "A human operator or admin process intentionally revoked this token.",
    remediation:
      "Ask the human operator whether access should be restored. If yes, they must create a new scoped agent token.",
    humanActionRequired: true,
    docsCommand: "upster agent guide",
  })
}

export function missingScopeError(input: {
  requiredScopes: Array<AccessScope>
  currentScopes: Array<AccessScope>
  action: string
}) {
  return new UpsterApiError({
    status: 403,
    code: "MISSING_SCOPE",
    message: `This token cannot ${input.action}.`,
    reason: `The request requires ${input.requiredScopes.join(", ")}.`,
    cause:
      "The current session was created without the scope needed for this operation.",
    remediation:
      "Ask the human operator to create a new scoped agent session with the required scope, or run a command allowed by the current scope set.",
    humanActionRequired: true,
    requiredScopes: input.requiredScopes,
    currentScopes: input.currentScopes,
    docsCommand: "upster agent guide",
  })
}

export function agentForbiddenError(input: {
  action: string
  command: string
}) {
  return new UpsterApiError({
    status: 403,
    code: "HUMAN_APPROVAL_REQUIRED",
    message: `Agents cannot ${input.action}.`,
    reason:
      "This operation is intentionally restricted to an interactive human session.",
    cause:
      "The operation can change authentication state, Vault state, or administrative access.",
    remediation: `Ask the human operator to run ${input.command} interactively.`,
    humanActionRequired: true,
    docsCommand: "upster agent guide",
  })
}

export function vaultLockedError() {
  return new UpsterApiError({
    status: 423,
    code: "VAULT_LOCKED",
    message: "Cloudflare Vault is locked.",
    reason:
      "Starting tunnels requires the Cloudflare config to be decrypted in the Upster control plane memory.",
    cause:
      "No active Vault unlock session exists, or the previous unlock session expired.",
    remediation:
      "Ask the human operator to run upster vault unlock. Agents cannot unlock the Vault or read Cloudflare secrets.",
    humanActionRequired: true,
    requiredScopes: ["vault:unlock"],
    docsCommand: "upster agent guide",
  })
}

export function vaultMissingError() {
  return new UpsterApiError({
    status: 404,
    code: "VAULT_MISSING",
    message: "No Cloudflare Vault has been saved.",
    reason:
      "The Upster control plane has no encrypted Cloudflare Vault record.",
    cause:
      "Cloudflare credentials have not been configured yet, or the Vault was deleted.",
    remediation:
      "Ask the human operator to run upster vault save interactively, then upster vault unlock.",
    humanActionRequired: true,
    requiredScopes: ["vault:write"],
    docsCommand: "upster agent guide",
  })
}

export function controlPlaneUnavailableError(input: { dashboardUrl: string }) {
  return new UpsterApiError({
    status: 503,
    code: "CONTROL_PLANE_UNAVAILABLE",
    message: "The Upster control plane is not reachable.",
    reason: `The CLI could not connect to ${input.dashboardUrl}.`,
    cause:
      "The dashboard server may not be running, may be bound to another port, or may be blocked by local networking.",
    remediation:
      "In human mode, run upster daemon start or start the dashboard with bun run dev. In agent mode, report that the human operator must start Upster.",
    humanActionRequired: true,
    docsCommand: "upster agent doctor",
  })
}

export function runtimeError(input: {
  code: string
  message: string
  reason: string
  cause: string
  remediation?: string
  details?: unknown
  status?: number
}) {
  return new UpsterApiError({
    status: input.status ?? 409,
    code: input.code,
    message: input.message,
    reason: input.reason,
    cause: input.cause,
    remediation:
      input.remediation ??
      "Run upster agent doctor for a non-mutating diagnostic check, then retry after the reported issue is resolved.",
    humanActionRequired: false,
    docsCommand: "upster agent doctor",
    details: input.details,
  })
}
