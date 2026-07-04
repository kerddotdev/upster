# Upster Security

Upster is a local, single-user development tool that controls Cloudflare
tunnels and runs mounted repositories as child processes. This document
describes the security model that is in place, what an operator still needs to
watch for, and how contributors (human or AI) should approach security-relevant
changes.

## Threat model

- Upster is intended to run on one developer's machine, reachable only over
  loopback by default.
- The most sensitive asset is the Cloudflare API token. It can change DNS and
  open tunnels for the configured zone, so it is treated as a high-value secret.
- Pills (the apps Upster runs) are assumed to be repositories the operator
  trusts. Upster is not a sandbox for untrusted code.
- The realistic adversary is another host or process on the same machine or
  local network, not a remote internet attacker.

## What is in place

### Authentication and sessions

- The dashboard requires an admin passphrase. It is stored only as an Argon2id
  verifier in the `admin_users` table, never in plaintext.
- Access is gated by a signed (HMAC-SHA256), `HttpOnly`, `SameSite=Lax` session
  cookie. `SameSite=Lax` also blocks cross-site POSTs, which protects the
  mutating server functions from CSRF.
- Dashboard, CLI, and agent access are backed by revocable rows in the
  `access_sessions` table. CLI and agent sessions use bearer tokens whose
  plaintext value is shown only when created. Upster stores only a token hash.
- Agents should receive only scoped capability tokens. Agent tokens can read and
  operate pills only within their scopes, and cannot receive vault write, vault
  unlock, vault delete, or admin-only scopes.
- The CLI stores local agent tokens separately from the human CLI credential.
  Non-interactive commands do not automatically use the saved human credential,
  so agent and automation processes must use scoped tokens through `--agent`,
  `UPSTER_AGENT`, `--token`, `--token-file`, or `UPSTER_TOKEN`.
- Every protected TanStack Start server function carries the auth middleware,
  and the streaming and metrics server routes verify the session manually
  because route handlers do not run server-function middleware.
- TanStack Start's built-in CSRF protection rejects cross-origin calls to
  server functions.

### Network exposure

- The container binds the dashboard on `127.0.0.1` by default. Exposing it on
  the local network is an explicit opt-in through `UPSTER_BIND_HOST`.
- There is no TLS by default; loopback-only operation makes transport sniffing a
  non-issue for the default setup.

### Secret handling

- Cloudflare credentials are encrypted in the browser with the vault passphrase
  or CLI with the vault passphrase (Argon2id key derivation,
  XChaCha20-Poly1305) and stored only as ciphertext.
- The plaintext config exists only in control plane memory during an explicit
  vault unlock or runtime action (validating the token or starting a tunnel) and
  is never persisted or logged.
- Agents cannot unlock the vault, save the vault, delete the vault, read vault
  ciphertext, read the vault passphrase, or read decrypted Cloudflare config.
  They can only read vault status fields such as whether a vault exists, whether
  it is unlocked, and the root domain.

### Database isolation

- The libSQL database is never published to the host; it is reachable only on
  the internal Docker network.
- It can additionally require an auth token (`SQLD_AUTH_JWT_KEY` on the db,
  `DATABASE_AUTH_TOKEN` on the dashboard) so that a compromised pill cannot read
  it. Generate a pair with `bun run db:credentials`.

### Process isolation

- Pill processes receive a minimal, explicit environment. They never inherit the
  dashboard environment, the database URL, or any dashboard secret.
- `UPSTER_ALLOWED_COMMANDS` can restrict which executables a pill may run.
- The dashboard container runs with `cap_drop: ALL` and
  `no-new-privileges:true`, so a pill cannot raise its privileges.

### Capsule isolation

- A capsule is a frozen, versioned snapshot of a pill's source, taken from the
  workspace-validated `repoPath` into the Upster-managed
  `<UPSTER_DATA_DIR>/capsules/<pillId>/<capsuleId>` directory. Each build creates
  a new immutable snapshot; a pill can keep several and deploy or roll back to
  any of them. Deploying from a capsule keeps the running deployment isolated
  from live edits on disk; it does not widen the source path boundary, because
  the source is still resolved and validated against the configured workspace
  roots before copying.
- The optional dependency install step during a capsule build runs the detected
  package manager with the same minimal, explicit environment as a pill process
  (no dashboard environment, no Cloudflare secret), and its executable is gated
  by `UPSTER_ALLOWED_COMMANDS` like any other pill command. Because installing
  dependencies can execute package lifecycle scripts, a capsule is still only as
  trusted as the repository it was copied from.
- Snapshot metadata may include git commit, branch, message, and dirty state.
  These are captured read-only with the `git` binary in the pill's `repoPath`;
  if the project is not a git repository or `git` is unavailable, the fields are
  simply left empty and every other capsule capability keeps working.
- The capsule file browser and file preview server functions resolve requested
  paths inside the snapshot directory and reject any path that escapes it
  (`..` or absolute), the same containment check used for workspace paths. File
  previews are capped in size. The archive download route
  (`/api/capsules/:id/archive`) verifies the dashboard session manually, like
  the terminal and metrics routes.
- Old, unpinned snapshots are pruned automatically per pill
  (`UPSTER_CAPSULE_RETENTION`); pinned snapshots and the currently deployed
  snapshot are never pruned or deletable while running.
- A snapshot can be deployed to the pill's production hostname
  (`slug.rootDomain`) or to a per-snapshot preview hostname
  (`slug-<first 8 chars of capsuleId>.rootDomain`) backed by its own Cloudflare tunnel and DNS
  record, stored on the capsule. Deleting or pruning a snapshot removes its
  preview tunnel and DNS record when the vault is unlocked, mirroring pill
  deletion; if the vault is locked the cleanup is skipped and the resources are
  left in Cloudflare, exactly like pill tunnels.

### Cloudflare resource ownership

- DNS records created by Upster are tagged with a `managed-by-upster` comment.
- Upster refuses to overwrite a DNS record it does not own, including records
  referenced by a stale stored record id.
- Deleting a pill with the vault unlocked also removes its tunnel and DNS
  record, and the UI warns if that cleanup could not be confirmed.

## What an operator still needs to watch for

- **Do not run untrusted repositories.** Pills run as a non-root-capable but
  still privileged process inside the container; there is no per-pill user
  isolation. Treat a pill as code you would run locally yourself.
- **Enable database auth in shared environments.** Without
  `SQLD_AUTH_JWT_KEY` / `DATABASE_AUTH_TOKEN`, a malicious pill on the Docker
  network could read the database, including the session signing secret, and
  forge an admin session. Setting `UPSTER_SESSION_SECRET` also keeps the secret
  out of the database.
- **Use TLS before exposing on a network.** If you set `UPSTER_BIND_HOST` to a
  non-loopback address, put the dashboard behind a TLS-terminating proxy and set
  `UPSTER_SECURE_COOKIES=true`.
- **Complete the first-run setup promptly.** Before an admin passphrase exists,
  anyone who can reach the dashboard can claim it. Loopback-only binding limits
  this to the local machine.
- **Choose a strong vault passphrase.** Vault passphrase strength is enforced
  only in the browser (minimum 12 characters). A weak passphrase weakens offline
  resistance if the ciphertext is ever exposed.
- **Keep the Cloudflare token least-privilege.** Scope it to the specific
  account and zone, and grant only the permissions Upster requests.
- **Pills can print secrets to their own logs.** Upster streams and stores pill
  output. Do not print secrets from a pill if you do not want them in the run
  logs.

## Guidance for AI agents and contributors

Read `AGENTS.md` first. These rules are mandatory:

- Cloudflare credentials may exist only as encrypted vault ciphertext at rest.
- Plaintext secrets may live only in memory during an explicit runtime action.
- Pill commands must never receive Cloudflare secrets in their environment.
- Pill paths must stay inside the configured workspace roots.
- Prefer argv arrays over shell strings for process execution.
- Never log secrets, tokens, vault payloads, command env values, or decrypted
  config.
- CLI API errors must use the agent-friendly error envelope with `reason`,
  `cause`, `remediation`, and `humanActionRequired`, especially for auth, scope,
  vault, and runtime failures.
- A human admin token must not be given to an AI agent. On the same operating
  system user account there is no perfect cryptographic human-vs-agent boundary,
  so scoped capability tokens, short TTLs, and revocation are the intended
  control.
- Agent workflows must not rely on the saved human CLI credential. Use a saved
  local agent token or an explicit scoped token, and keep human admin commands in
  an interactive terminal.

When making security-relevant changes:

- **Default new server functions to authenticated.** Add the auth middleware to
  every new server function unless it is intentionally public (only the auth
  status, login, setup, and logout functions are public). New `/api/*` server
  routes must verify the session manually, the way `terminal` and `metrics` do.
- **Keep server-only code out of the client bundle.** In a client-reachable
  `*.functions.ts` file, server-only imports may be used only inside a
  `.handler()` body (the compiler strips those). Never reference server-only
  code in the builder chain (`.middleware`, `.validator`), at module scope, or in
  a component. Middleware must live in a non-`*.server.ts` file and pull
  server-only code in inside its `.server()` callback (see
  `apps/web/src/features/auth/auth-middleware.ts`). The dev server hides these
  boundary mistakes; the production build catches them.
- **Verify with the production build, not only dev.** Run `bun run build` and,
  when the change affects runtime behavior, the Docker stack. Dev-only checks
  have previously masked both build failures and SSR auth-redirect differences.
- **Run the checks.** `bun run validate` (format, lint, typecheck, tests) must
  pass, and `bun run build` must succeed.
- **Re-run the penetration tests.** `tests/pentest/run.sh` boots an isolated
  instance (or targets a running one via `UPSTER_PENTEST_URL`) and asserts that
  unauthenticated and cross-site access is rejected.
- **Stay least-privilege.** New Cloudflare permissions, new environment
  variables, and new container capabilities should be the minimum required, and
  should be documented in `.env.example` and here.
- **Do not weaken these controls silently.** If a change relaxes a security
  property, call it out explicitly and update this document.
