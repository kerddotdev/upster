# Upster

Upster is a local Dockerized dashboard for publishing short-lived mini apps through Cloudflare Tunnel.

## Repository layout

Upster uses a Bun workspace layout. The dashboard app lives in `apps/web`, while
the CLI app lives in `apps/cli`, shared CLI/API contracts live in
`packages/core`, and the root `package.json` keeps the common commands for local
development, validation, database tasks, and Docker builds.

## Status

Upster is in beta and under active development. Use it at your own risk.

The project is intended for local, single-user development workflows. It is not production-ready yet, and some safety hardening is still planned around process isolation and Cloudflare record ownership.

Do not use Upster for untrusted repositories, public multi-user access, or sensitive production workloads until those safety items are completed.

## Install

You do not need the source code to run Upster. Install the CLI with Homebrew and
run the control plane from the published Docker image.

### CLI (Homebrew)

The `upster` CLI is a client for the local Upster control plane:

```bash
brew install kerdofficial/tap/upster
upster --version
```

### Control plane (Docker)

The dashboard and its libSQL database run as containers. The dashboard image is
published to `ghcr.io/kerdofficial/upster`. Download the compose file and env
template, configure `.env`, then start the stack:

```bash
mkdir upster && cd upster
curl -LO https://github.com/kerdofficial/upster/releases/latest/download/docker-compose.yaml
curl -Lo .env https://github.com/kerdofficial/upster/releases/latest/download/env.example
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
`upster vault save`, which stores them as encrypted vault ciphertext.

### Remote Access Over Tailscale

Upster can expose the dashboard to other devices in your private Tailscale
tailnet without giving the container Tailscale credentials. The native
Tailscale app runs on the host, and a small setup script writes a non-secret
status file that Docker mounts read-only.

From a source checkout on the host that runs Docker:

```bash
bun run tailscale:setup
docker compose up -d
```

The script prints the Tailscale HTTPS URL and the matching `.env` values:

```bash
UPSTER_ALLOWED_HOSTS=<magic-dns-name>
UPSTER_ALLOWED_ORIGINS=https://<magic-dns-name>:8443
UPSTER_TRUST_PROXY=true
UPSTER_TAILSCALE_DIR=./.tailscale
```

Open the dashboard, go to Connections, create a pairing link, and use the
Tailscale HTTPS tab or QR code on the device you want to pair.

## Security

See [SECURITY.md](SECURITY.md) for the full security model, operator caveats, and contributor and AI-agent guidance. Highlights:

- The dashboard requires an admin passphrase. On first run, open the app and set it on the setup screen. The passphrase is stored only as an Argon2id verifier and access is gated by a signed, HttpOnly session cookie.
- The dashboard port is published on `127.0.0.1` by default. For remote access, keep the loopback bind and expose it through Tailscale HTTPS with `bun run tailscale:setup`. Binding directly to the network with `UPSTER_BIND_HOST=0.0.0.0` is discouraged and disables the local password path (every client must pair).
- Cloudflare credentials are stored only as encrypted vault ciphertext and are decrypted in the browser, never persisted in plaintext.
- Pill processes run with a minimal environment and never inherit the dashboard environment or its secrets.
- The libSQL database can require an auth token so pill processes cannot read it directly. Generate credentials with `bun run db:credentials` and set `SQLD_AUTH_JWT_KEY` (db) and `DATABASE_AUTH_TOKEN` (dashboard).
- Restrict which executables pills may run with `UPSTER_ALLOWED_COMMANDS` (comma-separated, by exact name or full path). Leave empty to allow any executable.
- Cloudflare DNS records created by Upster are tagged as `managed-by-upster`, and Upster refuses to overwrite a record it does not own. Deleting a pill with the vault unlocked also removes its tunnel and DNS record.
- Override the session signing secret with `UPSTER_SESSION_SECRET`; otherwise one is generated and persisted locally.
- The CLI talks to the local dashboard control plane over `/api/cli/v1`. Human
  users can sign in with the admin passphrase, while AI agents should use
  short-lived scoped bearer tokens created by a human operator. Agents cannot
  unlock, save, delete, export, or decrypt the Cloudflare vault.

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
