# Upster

Upster is a local Dockerized admin dashboard for publishing short-lived mini apps through Cloudflare Tunnel. It manages mounted repositories as Upster pills, assigns local ports, starts app commands, configures per-pill Cloudflare tunnels, streams logs, and shows tunnel metrics. A pill can run from its live source or from a capsule, a frozen copy of the source kept under the Upster data directory so live edits on disk do not affect the running deployment.

## Tech Stack

- Bun
- TanStack Start
- React
- TypeScript strict mode
- Tailwind CSS v4
- shadcn/ui with the base-mira style
- Drizzle ORM
- libSQL sidecar in Docker
- Cloudflare Tunnel through the Cloudflare API and cloudflared
- ghostty-web for terminal rendering

## Code Conventions

- Keep TypeScript strict and prefer explicit domain types for pill, tunnel, run, and vault data.
- Use TanStack Start server functions for app-owned queries and mutations.
- Use server routes only for streaming, raw HTTP endpoints, or integrations that should not be server functions.
- Keep server-only code in `*.server.ts` files.
- Keep client-safe server function wrappers in `*.functions.ts` files.
- Never import server-only modules into UI components.
- Use shadcn components before custom markup.
- Use semantic Tailwind tokens and `cn()`.
- Use `gap-*`, not `space-*`.
- Do not add comments unless the code is genuinely complex.
- Do not log secrets, tokens, vault payloads, command env values, or decrypted config.
- Do not use emoji, em dash, or en dash in code, docs, or committed files.
- Use only normal hyphen characters when punctuation needs a dash.

## Security Rules

See `SECURITY.md` for the full security model, operator caveats, and the
detailed guidance for security-relevant changes. The mandatory rules:

- Cloudflare credentials must be stored only as encrypted vault ciphertext.
- Plaintext secrets may exist only in memory during an explicit runtime action.
- Pill commands must not receive Cloudflare secrets in their environment, and
  must run with a minimal explicit environment, never the dashboard environment.
- Pill paths must stay inside configured workspace roots.
- Prefer argv arrays over shell strings for process execution.
- Every server function that exposes app data or mutations must use the auth
  middleware. Only the auth status, login, setup, and logout functions are
  public.
- Server routes under `/api/*` must verify the session manually; server-function
  middleware does not run for them.
- In a client-reachable `*.functions.ts` file, server-only imports may be used
  only inside a `.handler()` body, which the compiler strips from the client
  bundle. Never reference server-only code in the builder chain (`.middleware`,
  `.validator`), at module scope, or in a component. Middleware must live in a
  non-`*.server.ts` file and pull server-only code in inside its `.server()`
  callback. The dev server hides these mistakes; the production build catches
  them.
- Keep Cloudflare permissions, environment variables, and container
  capabilities least-privilege, and document new ones in `.env.example` and
  `SECURITY.md`.
- Do not weaken a security control silently. Call it out and update `SECURITY.md`.

## Code Quality Checks

Run this after every significant change:

```sh
bun run validate
```

`validate` must format with Prettier, run ESLint, run TypeScript typecheck, and run tests.

For security-relevant or runtime changes, also run `bun run build` and verify
against the Docker stack, not only `bun run dev`. After auth or exposure
changes, run the penetration tests in `tests/pentest/run.sh`.

## Commit Style

Use short conventional commit messages with no body.

Allowed prefixes:

- `feat:`
- `fix:`
- `refactor:`
- `chore:`
- `test:`
- `docs:`
- `build:`
- `ci:`

Examples:

- `feat: add pill runtime schema`
- `fix: rotate occupied pill ports`
- `docs: add upster agent guide`
