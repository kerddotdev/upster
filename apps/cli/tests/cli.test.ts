import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Writable } from "node:stream"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runCli } from "../src/index"

class Capture extends Writable {
  output = ""

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ) {
    this.output += chunk.toString()
    callback()
  }
}

let configDir = ""

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "upster-cli-test-"))
  process.env.UPSTER_CLI_CONFIG_DIR = configDir
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.UPSTER_CLI_CONFIG_DIR
  delete process.env.UPSTER_AGENT
  rmSync(configDir, { recursive: true, force: true })
})

describe("upster cli", () => {
  it("prints detailed help", async () => {
    const stdout = new Capture()
    const stderr = new Capture()
    const code = await runCli(["--help"], {
      stdout,
      stderr,
      stdin: process.stdin,
    })

    expect(code).toBe(0)
    expect(stdout.output).toContain("Auth model:")
    expect(stdout.output).toContain("Agent-safe commands:")
    expect(stdout.output).toContain("upster agent doctor --json")
    expect(stdout.output).toContain("Scope list:")
  })

  it("prints a readable agent guide without an extra success payload", async () => {
    const stdout = new Capture()
    const stderr = new Capture()
    const code = await runCli(["agent", "guide"], {
      stdout,
      stderr,
      stdin: process.stdin,
    })

    expect(code).toBe(0)
    expect(stdout.output).toContain("# Upster agent guide")
    expect(stdout.output).not.toContain('"printed"')
  })

  it("returns machine readable doctor errors when the control plane is down", async () => {
    const stdout = new Capture()
    const stderr = new Capture()
    const code = await runCli(
      ["agent", "doctor", "--json", "--dashboard-url", "http://127.0.0.1:1"],
      {
        stdout,
        stderr,
        stdin: process.stdin,
      }
    )
    const payload = JSON.parse(stdout.output)

    expect(code).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.error.code).toBe("CONTROL_PLANE_UNAVAILABLE")
    expect(payload.error.reason).toBeTruthy()
    expect(payload.error.cause).toBeTruthy()
    expect(payload.error.remediation).toContain("human operator")
    expect(payload.error.humanActionRequired).toBe(true)
  })

  it("returns a human approval envelope for non-interactive human-only commands", async () => {
    const stdout = new Capture()
    const stderr = new Capture()
    const code = await runCli(["vault", "unlock", "--json"], {
      stdout,
      stderr,
      stdin: process.stdin,
    })
    const payload = JSON.parse(stdout.output)

    expect(code).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.error.code).toBe("HUMAN_APPROVAL_REQUIRED")
    expect(payload.error.humanActionRequired).toBe(true)
    expect(payload.error.reason).toBeTruthy()
    expect(payload.error.cause).toBeTruthy()
    expect(payload.error.remediation).toContain("upster vault unlock")
  })

  it("returns an envelope when output overwrite is refused", async () => {
    const outputPath = join(configDir, "guide.output")
    writeFileSync(outputPath, "{}\n")
    const stdout = new Capture()
    const stderr = new Capture()
    const code = await runCli(
      ["agent", "guide", "--json", "--output", outputPath],
      {
        stdout,
        stderr,
        stdin: process.stdin,
      }
    )
    const payload = JSON.parse(stdout.output)

    expect(code).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.error.code).toBe("OUTPUT_FILE_EXISTS")
    expect(payload.error.remediation).toContain("--force")
  })

  it("blocks saved human credentials in non-interactive admin commands", async () => {
    writeFileSync(
      join(configDir, "credentials.json"),
      '{"token":"upst_human"}\n'
    )
    const stdout = new Capture()
    const stderr = new Capture()
    const code = await runCli(["sessions", "list", "--json"], {
      stdout,
      stderr,
      stdin: process.stdin,
    })
    const payload = JSON.parse(stdout.output)

    expect(code).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.error.code).toBe("HUMAN_CREDENTIAL_BLOCKED")
    expect(payload.error.remediation).toContain("--agent")
  })

  it("uses the default local agent token before saved human credentials", async () => {
    writeFileSync(
      join(configDir, "credentials.json"),
      '{"token":"upst_human"}\n'
    )
    writeFileSync(
      join(configDir, "agent-tokens.json"),
      JSON.stringify({
        version: 1,
        default: "Codex",
        tokens: {
          Codex: {
            token: "upst_agent",
            dashboardUrl: "http://127.0.0.1:3377",
            scopes: ["pills:read"],
            expiresAt: null,
            createdAt: "2026-06-28T00:00:00.000Z",
            sessionId: "agent-session",
          },
        },
      })
    )
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            authorization: (init?.headers as Record<string, string>)
              ?.Authorization,
          },
          meta: {
            generatedAt: "2026-06-28T00:00:00.000Z",
            requestId: "test",
          },
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    })
    vi.stubGlobal("fetch", fetchMock)
    const stdout = new Capture()
    const stderr = new Capture()
    const code = await runCli(["pills", "list", "--json"], {
      stdout,
      stderr,
      stdin: process.stdin,
    })
    const payload = JSON.parse(stdout.output)

    expect(code).toBe(0)
    expect(payload.data.authorization).toBe("Bearer upst_agent")
  })

  it("saves created agent tokens to the local agent store", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              token: "upst_created",
              session: {
                id: "created-session",
                scopes: ["pills:read", "runs:start"],
                expiresAt: "2026-07-28T00:00:00.000Z",
                createdAt: "2026-06-28T00:00:00.000Z",
              },
            },
            meta: {
              generatedAt: "2026-06-28T00:00:00.000Z",
              requestId: "test",
            },
          }),
          { headers: { "Content-Type": "application/json" } }
        )
      })
    )
    const stdout = new Capture()
    const stderr = new Capture()
    const code = await runCli(
      [
        "agents",
        "create",
        "--label",
        "Codex",
        "--ttl",
        "1d",
        "--preset",
        "agent-full-runtime",
        "--save",
        "--default",
        "--json",
      ],
      {
        stdout,
        stderr,
        stdin: process.stdin,
      }
    )
    const store = JSON.parse(
      readFileSync(join(configDir, "agent-tokens.json"), "utf-8")
    )

    expect(code).toBe(0)
    expect(store.default).toBe("Codex")
    expect(store.tokens.Codex.token).toBe("upst_created")
    expect(store.tokens.Codex.sessionId).toBe("created-session")
  })
})
