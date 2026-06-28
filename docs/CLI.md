# Upster CLI Manual

This document is the human-facing manual for the Upster CLI. The shorter agent-facing guide is available from the CLI itself:

```sh
upster agent guide
upster agent guide --json
```

During local development, the built binary is available here:

```sh
./apps/cli/dist/upster --help
```

In this document, `upster` means the installed or built CLI. When running from a local build, replace `upster` with:

```sh
./apps/cli/dist/upster
```

## Control Plane Model

The CLI does not own a separate runtime. It is an authenticated client for the local Upster control plane behind the dashboard. The dashboard, CLI, and agents all use the same `/api/cli/v1` API for pills, runs, logs, metrics, vault status, and sessions.

Default control plane URL:

```txt
http://127.0.0.1:3377
```

Use another dashboard URL for one command:

```sh
upster status --dashboard-url http://127.0.0.1:4591
```

Persist a dashboard URL:

```sh
upster config set dashboardUrl http://127.0.0.1:3377
upster config get dashboardUrl
```

## Build And Run Locally

Build the CLI:

```sh
bun run cli:build
```

Or directly:

```sh
bun run --cwd apps/cli build
```

Run the built CLI:

```sh
./apps/cli/dist/upster --help
```

Run the CLI in development without a build:

```sh
bun run --cwd apps/cli upster -- --help
```

Start the dashboard/control plane:

```sh
bun run dev
```

Run the Docker stack:

```sh
docker compose up --build
```

## Global Options

Most commands accept these options:

```txt
--json                    Return a JSON API envelope
--input <file|->          Read JSON input from a file or stdin
--output <file>           Write the full output envelope to a file
--force                   Allow --output to overwrite an existing file
--dashboard-url <url>     Override the control plane URL
--token <token>           Use a bearer token for this command
--token-file <file>       Read a bearer token from a file
--no-color                Disable terminal color
--help                    Show help
```

Examples:

```sh
upster status --json
upster pills list --json --output pills.output
upster pills list --json --output pills.output --force
upster status --dashboard-url http://127.0.0.1:4591
UPSTER_TOKEN=upst_xxx upster pills list --json
upster pills list --token-file ./agent-token.txt --json
```

When `--output` is used, the CLI writes the full envelope to the file. Existing files are never overwritten unless `--force` is present.

## Output Modes

Readable output is the default:

```sh
upster status
```

JSON output:

```sh
upster status --json
```

Successful JSON response:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "generatedAt": "2026-06-28T00:00:00.000Z",
    "requestId": "..."
  }
}
```

Failure JSON response:

```json
{
  "ok": false,
  "error": {
    "code": "MISSING_SCOPE",
    "message": "This token cannot start pill runs.",
    "reason": "The request requires runs:start.",
    "cause": "The current session was created without the scope needed for this operation.",
    "remediation": "Ask the human operator to create a new scoped agent session with the required scope, or run a command allowed by the current scope set.",
    "humanActionRequired": true,
    "requiredScopes": ["runs:start"],
    "currentScopes": ["pills:read"],
    "docsCommand": "upster agent guide"
  },
  "meta": {
    "generatedAt": "2026-06-28T00:00:00.000Z",
    "requestId": "..."
  }
}
```

The CLI must not print secrets, vault ciphertext, passphrases, Cloudflare API tokens, decrypted configs, or command environment values.

## Authentication

Upster has two CLI authentication models:

- Human CLI session: created with the admin passphrase and full admin scopes.
- Agent session: created by a human, scoped, TTL-based, and bearer-token based.

First setup:

```sh
upster auth setup
```

Login:

```sh
upster auth login
```

Status:

```sh
upster auth status
```

Logout revokes the current CLI token:

```sh
upster auth logout
```

The CLI stores the human CLI session token in its local credentials file. Do not store an agent token as the human admin credential. Agents should use `--token`, `--token-file`, or `UPSTER_TOKEN`.

Important: a human admin token has full access. Do not give it to an AI agent.

## Interactive-Only Commands

These commands intentionally require interactive human use in the current CLI. They are rejected when called with `--json` or `--input`.

```sh
upster auth setup
upster auth login
upster vault save
upster vault unlock
upster vault delete
```

## Admin-Only Commands

These commands require a human CLI or dashboard session with the required admin scope. Agents cannot run them, but a human admin can use JSON output for automation around the CLI itself.

```sh
upster agents create --label <label> --ttl <duration> --scopes <scopes>
upster sessions revoke <id>
upster agents revoke <id>
upster vault lock
```

Agents cannot save, unlock, delete, export, or decrypt the vault.

## Sessions

List sessions:

```sh
upster sessions list
upster sessions list --json
```

Revoke a session:

```sh
upster sessions revoke <sessionId>
```

Agent revoke uses the same session revoke API:

```sh
upster agents revoke <sessionId>
```

After revoke, the token fails immediately.

## Scopes

Current scope list:

| Scope | Agent allowed | Purpose |
| --- | --- | --- |
| `pills:read` | yes | List and read pills |
| `pills:write` | yes | Add and update pills |
| `pills:delete` | yes | Delete pills |
| `runs:start` | yes | Start pill runs |
| `runs:stop` | yes | Stop pill runs |
| `logs:read` | yes | Read and stream run logs |
| `metrics:read` | yes | Read tunnel metrics |
| `runtime:read` | yes | Read runtime and control plane status |
| `vault:status` | yes | Read vault status without secrets |
| `sessions:read` | no | List sessions as a human admin |
| `sessions:revoke` | no | Revoke sessions as a human admin |
| `vault:write` | no | Save the vault as a human admin |
| `vault:unlock` | no | Unlock the vault as a human admin |
| `vault:delete` | no | Delete the vault as a human admin |

There is no `all` scope. This is intentional: `all` would be ambiguous because agents must never receive vault unlock, vault write, vault delete, or session admin scopes.

Full agent runtime scope list:

```sh
AGENT_FULL_RUNTIME_SCOPES="pills:read,pills:write,pills:delete,runs:start,runs:stop,logs:read,metrics:read,runtime:read,vault:status"
```

Create a full runtime agent token:

```sh
AGENT_FULL_RUNTIME_SCOPES="pills:read,pills:write,pills:delete,runs:start,runs:stop,logs:read,metrics:read,runtime:read,vault:status"
upster agents create --label "Codex" --ttl 1d --scopes "$AGENT_FULL_RUNTIME_SCOPES"
```

Create a read-only agent token:

```sh
upster agents create --label "Read only agent" --ttl 1d --scopes pills:read,logs:read,metrics:read,runtime:read,vault:status
```

Create a pill-list-only agent token:

```sh
upster agents create --label "Pill reader" --ttl 8h --scopes pills:read
```

TTL format:

```txt
30m
8h
1d
```

Maximum agent token TTL: 30 days.

## Agent Token Usage

Use a token through an environment variable:

```sh
UPSTER_TOKEN=upst_xxx upster agent doctor --json
UPSTER_TOKEN=upst_xxx upster pills list --json
```

Use a token from a file:

```sh
upster pills list --token-file ./agent-token.txt --json
```

Use a token directly:

```sh
upster pills list --token upst_xxx --json
```

Token source priority:

1. `--token`
2. `--token-file`
3. `UPSTER_TOKEN`
4. saved human CLI credential

Recommended first diagnostic command for agents:

```sh
upster agent doctor --json
```

## Agent Guide

Readable agent guide:

```sh
upster agent guide
```

Machine-readable capability guide:

```sh
upster agent guide --json
```

It includes:

- agent-safe commands
- human-only commands
- scope list
- presets
- common errors
- token usage rules

## Daemon And Status

Control plane status:

```sh
upster status
upster status --json
```

Daemon status alias:

```sh
upster daemon status
```

Start the daemon:

```sh
upster daemon start
```

In agent mode, the CLI does not automatically start the control plane. If the dashboard is unavailable, JSON mode returns `CONTROL_PLANE_UNAVAILABLE`.

## Config

Read config:

```sh
upster config get dashboardUrl
upster config get dashboardPort
upster config get databaseUrl
upster config get databasePort
```

Write config:

```sh
upster config set dashboardUrl http://127.0.0.1:3377
upster config set dashboardPort 3377
upster config set databaseUrl libsql://127.0.0.1:8080
upster config set databasePort 8080
```

Override the CLI config directory for development or tests:

```sh
UPSTER_CLI_CONFIG_DIR=/tmp/upster-cli upster status
```

## Vault

Vault status:

```sh
upster vault status
upster vault status --json
```

Vault status only returns public state:

- whether a vault is saved
- whether it is unlocked
- root domain
- unlock timestamp
- expiry
- last used timestamp

Save the vault:

```sh
upster vault save
```

Unlock the vault:

```sh
upster vault unlock
upster vault unlock --ttl 8h
```

Lock the vault:

```sh
upster vault lock
```

Delete the vault:

```sh
upster vault delete
```

Default unlock TTL: 8 hours.

Maximum unlock TTL: 24 hours.

Agent vault rules:

- agents may read vault status with `vault:status`
- agents cannot unlock the vault
- agents cannot save the vault
- agents cannot delete the vault
- agents cannot read vault ciphertext
- agents cannot receive Cloudflare secrets

If a run fails because the vault is missing or locked, the agent should ask the human to run:

```sh
upster vault save
upster vault unlock
```

## Pills

List pills:

```sh
upster pills list
upster pills list --json
```

Get a pill:

```sh
upster pills get <pillId>
upster pills get <pillId> --json
```

Add a pill interactively:

```sh
upster pills add
```

Add a pill from JSON input:

```sh
upster pills add --input pill.json --json
```

Example `pill.json`:

```json
{
  "name": "My App",
  "slug": "my-app",
  "repoPath": "/Users/dani/Developer/my-app",
  "defaultEnv": "dev",
  "commandName": "dev",
  "command": "bun run dev",
  "cwd": "/Users/dani/Developer/my-app",
  "healthcheckPath": "/"
}
```

Fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Human-readable name |
| `slug` | no | URL and identifier-style slug |
| `repoPath` | yes | Repository path, must be inside an allowed workspace root |
| `defaultEnv` | yes | Default command name |
| `commandName` | yes | Command name to create |
| `command` | yes | Command to run |
| `cwd` | no | Working directory |
| `healthcheckPath` | no | Healthcheck path |

Delete a pill:

```sh
upster pills delete <pillId>
upster pills delete <pillId> --json
```

There is an API route for pill updates, but the current CLI does not expose a dedicated `pills update` command yet.

## Run Start And Stop

Start a pill with its default command:

```sh
upster pills run <pillId>
upster pills run <pillId> --json
```

Start a specific command:

```sh
upster pills run <pillId> --command dev
```

Set an expiry:

```sh
upster pills run <pillId> --expiresAt 2026-06-28T23:00:00.000Z
```

Request port rotation:

```sh
upster pills run <pillId> --rotatePorts true
```

Stop a pill:

```sh
upster pills stop <pillId>
upster pills stop <pillId> --runId <runId>
```

Starting a run requires:

- `runs:start` scope
- saved Cloudflare vault
- human-unlocked vault session
- reachable control plane
- valid pill config
- allowed command when `UPSTER_ALLOWED_COMMANDS` is configured
- available port or successful port rotation

## Runs, Logs, And Metrics

Get a run:

```sh
upster runs get <runId>
upster runs get <runId> --json
```

Read run logs:

```sh
upster runs logs <runId>
upster runs logs <runId> --json
```

Stream run logs:

```sh
upster runs logs <runId> --follow
```

Write logs to a file:

```sh
upster runs logs <runId> --json --output run.output
```

Metrics:

```sh
upster runs metrics <runId>
upster runs metrics <runId> --json
upster runs metrics <runId> --json --output metrics.output
```

The metrics endpoint returns the runtime data available through the control plane. The current CLI accepts a `--raw` flag as a parsed command flag, but it does not change output behavior yet.

## JSON Input From Stdin

Non-sensitive commands can read JSON from stdin:

```sh
cat pill.json | upster pills add --input - --json
```

Sensitive human-only commands do not accept JSON input:

```sh
upster vault save --input vault.json
```

That command is rejected because vault passphrases and Cloudflare credentials must be entered through interactive prompts.

## Common Errors

### `AUTH_TOKEN_MISSING`

No token or authenticated dashboard session was sent.

Human fix:

```sh
upster auth login
```

Agent fix:

```sh
upster agents create --label "Codex" --ttl 1d --scopes "$AGENT_FULL_RUNTIME_SCOPES"
UPSTER_TOKEN=upst_xxx upster agent doctor --json
```

### `AUTH_TOKEN_INVALID`

The token is wrong, belongs to another Upster instance, was mistyped, or is not an `upst_` token.

Fix: create a fresh scoped agent token.

### `AUTH_TOKEN_EXPIRED`

The token TTL elapsed.

Fix:

```sh
upster agents create --label "Codex" --ttl 1d --scopes "$AGENT_FULL_RUNTIME_SCOPES"
```

### `AUTH_TOKEN_REVOKED`

The session was revoked.

Fix: a human should decide whether access should be restored. If yes, create a new agent session.

### `MISSING_SCOPE`

The token is valid but lacks the required scope.

The error includes:

- `requiredScopes`
- `currentScopes`
- `remediation`

Fix: create a new token with the required scope.

### `VAULT_MISSING`

No Cloudflare vault has been saved.

Human fix:

```sh
upster vault save
upster vault unlock
```

### `VAULT_LOCKED`

A vault exists, but there is no active unlocked session in control plane memory.

Human fix:

```sh
upster vault unlock
```

### `CONTROL_PLANE_UNAVAILABLE`

The dashboard/control plane is not reachable.

Fix:

```sh
bun run dev
```

Or with Docker:

```sh
docker compose up --build
```

Diagnostic command:

```sh
upster agent doctor --json
```

### `HUMAN_APPROVAL_REQUIRED`

The requested operation is intentionally human-only.

Fix: the human should run the command shown in the error `remediation` field.

### `OUTPUT_FILE_EXISTS`

The `--output` target already exists.

Fix:

```sh
upster pills list --json --output pills.output --force
```

Or choose another output path.

## Typical Human And Agent Workflow

1. Start the dashboard/control plane:

```sh
bun run dev
```

2. Human login:

```sh
upster auth login
```

3. Save and unlock the vault:

```sh
upster vault save
upster vault unlock --ttl 8h
```

4. Create an agent token:

```sh
AGENT_FULL_RUNTIME_SCOPES="pills:read,pills:write,pills:delete,runs:start,runs:stop,logs:read,metrics:read,runtime:read,vault:status"
upster agents create --label "Codex" --ttl 1d --scopes "$AGENT_FULL_RUNTIME_SCOPES"
```

5. Agent diagnostic:

```sh
UPSTER_TOKEN=upst_xxx upster agent doctor --json
```

6. List pills:

```sh
UPSTER_TOKEN=upst_xxx upster pills list --json
```

7. Start a pill:

```sh
UPSTER_TOKEN=upst_xxx upster pills run <pillId> --json
```

8. Read logs and metrics:

```sh
UPSTER_TOKEN=upst_xxx upster runs logs <runId> --json --output run.output
UPSTER_TOKEN=upst_xxx upster runs metrics <runId> --json --output metrics.output
```

9. Revoke the agent token:

```sh
upster agents revoke <sessionId>
```

## Security Rules

- Do not give a human admin token to an agent.
- Do not give a vault passphrase to an agent.
- Do not give a Cloudflare API token to an agent.
- Do not give vault ciphertext to an agent.
- Give agents only scoped bearer tokens.
- Use short TTLs for agent tokens.
- After revoke, verify that the agent receives `AUTH_TOKEN_REVOKED`.
- If an agent gets a vault error, it should not ask for secrets. It should ask the human to run `vault save` or `vault unlock`.

## Command Reference

```txt
upster --help
upster status
upster daemon status
upster daemon start

upster config get <key>
upster config set <key> <value>

upster auth status
upster auth setup
upster auth login
upster auth logout

upster sessions list
upster sessions revoke <id>

upster agents create --label <label> --ttl <duration> --scopes <scopes>
upster agents revoke <id>

upster agent guide
upster agent guide --json
upster agent doctor --json

upster vault status
upster vault save
upster vault unlock --ttl 8h
upster vault lock
upster vault delete

upster pills list
upster pills get <pillId>
upster pills add
upster pills add --input pill.json --json
upster pills delete <pillId>
upster pills run <pillId>
upster pills stop <pillId>

upster runs get <runId>
upster runs logs <runId>
upster runs logs <runId> --follow
upster runs metrics <runId>
```
