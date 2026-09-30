# Upster

Upster is a local dashboard (Docker, or a native desktop app and background service) for publishing short-lived mini apps through Cloudflare Tunnel.

## Repository layout

Upster uses a Bun workspace layout. The dashboard app lives in `apps/web`, while
the CLI app lives in `apps/cli`, the Electron desktop app lives in
`apps/desktop`, the native background service manager lives in
`packages/service`, shared CLI/API contracts live in
`packages/core`, and the root `package.json` keeps the common commands for local
development, validation, database tasks, and Docker builds.

## Scope

Upster is built for local, single-user development workflows. Do not use it for untrusted repositories, public multi-user access, or sensitive production workloads: pills run with your own privileges, and some safety hardening around process isolation and Cloudflare record ownership is still planned. See `SECURITY.md` for the security model.

## Install

You do not need the source code to run Upster. Install the CLI with Homebrew and
run the control plane from the published Docker image.

### CLI (Homebrew)

The `upster` CLI is a client for the local Upster control plane:

```bash
brew install kerddotdev/tap/upster
upster --version
```

### Control plane (Docker)

The dashboard and its libSQL database run as containers. The dashboard image is
published to `ghcr.io/kerddotdev/upster`. Download the compose file and env
template, configure `.env`, then start the stack:

```bash
mkdir upster && cd upster
curl -LO https://github.com/kerddotdev/upster/releases/latest/download/docker-compose.yaml
curl -Lo .env https://github.com/kerddotdev/upster/releases/latest/download/env.example
# edit .env with your settings, then:
docker compose up -d
```

Then complete first-time setup (through the dashboard at `http://127.0.0.1:3377`
or the CLI):

```bash
upster auth setup
upster vault save
upster vault unlock
```

Cloudflare credentials are never placed in `.env`; you provide them once through
`upster vault save`, which stores them as encrypted Vault ciphertext.

### Desktop app and native service (macOS, Linux)

The desktop app runs Upster without Docker. It installs a per-user background
service (LaunchAgent or systemd user unit) that owns your pills, database and
tunnels, so remote browser access keeps working when the app is closed. The
app, the CLI and the browser are all clients of that one service.

```sh
bun run package:desktop   # builds the app for the current platform
upster service install --bundle <server-bundle-dir>   # headless, no app
```

The desktop onboarding can migrate an existing Docker install (admin, pills,
logs, vault, capsules); the Docker data is left untouched. `Reset Upster...` in
the app menu starts over.

Headless machines (no desktop) can use the server bundle from the release
assets (`upster-server-<os>-<arch>.tar.gz`): extract it and run
`upster service install --bundle <extracted-dir>`.

Native installs give up the container boundary; read the "Native (non-Docker)
installs" section in `SECURITY.md` first. Windows keeps using Docker.

### Remote Access Over Tailscale

Upster can expose the dashboard to other devices in your private Tailscale
tailnet without giving the dashboard container any Tailscale credentials. A
Tailscale sidecar container (started automatically by `docker compose up`) joins
the tailnet and reverse-proxies to the dashboard. There is no host command and
no extra environment variables to set.

To enable it:

1. Start the stack: `docker compose up -d` (this brings up the Tailscale
   sidecar alongside the dashboard).
2. Open the dashboard at `http://127.0.0.1:3377`, go to Settings > Tailscale,
   and click "Connect to tailnet". Approve the printed login URL in your
   Tailscale admin console.
3. Click "Enable remote access". The dashboard becomes reachable at
   `https://<magic-dns-name>` (and `http://<tailscale-ip>:10000`) for your
   tailnet peers.

Then open Connections, create a pairing link, and use the Tailscale HTTPS URL or
QR code on the device you want to pair. For unattended or headless setups you can
instead provide a Tailscale auth key via the optional `TS_AUTHKEY` environment
variable.

## Security

See [SECURITY.md](SECURITY.md) for the full security model, operator caveats, and contributor and AI-agent guidance. Highlights:

- The dashboard requires an admin passphrase. On first run, open the app and set it on the setup screen. The passphrase is stored only as an Argon2id verifier and access is gated by a signed, HttpOnly session cookie.
- The dashboard port is published on `127.0.0.1` by default. For remote access, keep the loopback bind and enable Tailscale in Settings > Tailscale (served by the sidecar container). Binding directly to the network with `UPSTER_BIND_HOST=0.0.0.0` is discouraged and disables the local password path (every client must pair).
- Cloudflare credentials are stored only as encrypted Vault ciphertext and are decrypted in the browser, never persisted in plaintext.
- Pill processes run with a minimal environment and never inherit the dashboard environment or its secrets.
- The libSQL database can require an auth token so pill processes cannot read it directly. Generate credentials with `bun run db:credentials` and set `SQLD_AUTH_JWT_KEY` (db) and `DATABASE_AUTH_TOKEN` (dashboard).
- Restrict which executables pills may run with `UPSTER_ALLOWED_COMMANDS` (comma-separated, by exact name or full path). Leave empty to allow any executable.
- Cloudflare DNS records created by Upster are tagged as `managed-by-upster`, and Upster refuses to overwrite a record it does not own. Deleting a pill with the Vault unlocked also removes its tunnel and DNS record.
- Override the session signing secret with `UPSTER_SESSION_SECRET`; otherwise one is generated and persisted locally.
- The CLI talks to the local dashboard control plane over `/api/cli/v1`. Human
  users can sign in with the admin passphrase, while AI agents should use
  short-lived scoped bearer tokens created by a human operator. Agents cannot
  unlock, save, delete, export, or decrypt the Cloudflare Vault.

## Development

Run the local dashboard:

```bash
bun run dev
```

Run the local CLI during development:

```bash
bun run --cwd apps/cli upster -- --help
```

See [docs/CLI.md](docs/CLI.md) for the full CLI command reference, scope list,
agent token examples, JSON input/output rules, and common error remediation.

Run the full stack with Docker:

```bash
docker compose up --build
```

## Validation

```bash
bun run validate
```

## Disclaimer

Upster is an independent, unofficial project. It is not affiliated with,
endorsed by, or sponsored by Cloudflare, Inc. "Cloudflare" and "Cloudflare
Tunnel" are trademarks of Cloudflare, Inc., used here only to describe
interoperability. You are responsible for your own Cloudflare account, API
token, and any resources Upster creates on your behalf.
