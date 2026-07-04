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

  function stubJsonFetch() {
    const calls: Array<{
      url: string
      method?: string
      body?: unknown
    }> = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(
        JSON.stringify({
          ok: true,
          data: {},
          meta: { generatedAt: "2026-06-28T00:00:00.000Z", requestId: "test" },
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    })
    vi.stubGlobal("fetch", fetchMock)
    return { calls, fetchMock }
  }

  async function run(args: Array<string>) {
    const stdout = new Capture()
    const stderr = new Capture()
    const code = await runCli(args, { stdout, stderr, stdin: process.stdin })
    return { code, stdout, stderr }
  }

  const base = "http://127.0.0.1:3377/api/cli/v1"

  it("maps capsules list to the pill capsules route", async () => {
    const { calls } = stubJsonFetch()
    const { code } = await run(["capsules", "list", "pill-1", "--json"])

    expect(code).toBe(0)
    expect(calls[0].method).toBe("GET")
    expect(calls[0].url).toBe(`${base}/pills/pill-1/capsules`)
  })

  it("maps capsules build flags to the build body", async () => {
    const { calls } = stubJsonFetch()
    const { code } = await run([
      "capsules",
      "build",
      "pill-1",
      "--install",
      "--label",
      "demo build",
      "--json",
    ])

    expect(code).toBe(0)
    expect(calls[0].method).toBe("POST")
    expect(calls[0].url).toBe(`${base}/pills/pill-1/capsules`)
    expect(calls[0].body).toEqual({
      includeNodeModules: false,
      installDeps: true,
      label: "demo build",
    })
  })

  it("maps capsules delete to the capsule route", async () => {
    const { calls } = stubJsonFetch()
    const { code } = await run(["capsules", "delete", "cap-1", "--json"])

    expect(code).toBe(0)
    expect(calls[0].method).toBe("DELETE")
    expect(calls[0].url).toBe(`${base}/capsules/cap-1`)
  })

  it("maps capsules relabel with a label", async () => {
    const { calls } = stubJsonFetch()
    const { code } = await run([
      "capsules",
      "relabel",
      "cap-1",
      "--label",
      "rc",
      "--json",
    ])

    expect(code).toBe(0)
    expect(calls[0].method).toBe("POST")
    expect(calls[0].url).toBe(`${base}/capsules/cap-1/relabel`)
    expect(calls[0].body).toEqual({ label: "rc" })
  })

  it("maps capsules relabel --clear to a null label", async () => {
    const { calls } = stubJsonFetch()
    const { code } = await run([
      "capsules",
      "relabel",
      "cap-1",
      "--clear",
      "--json",
    ])

    expect(code).toBe(0)
    expect(calls[0].body).toEqual({ label: null })
  })

  it("rejects capsules relabel without a label or --clear", async () => {
    const { fetchMock } = stubJsonFetch()
    const { code, stdout } = await run([
      "capsules",
      "relabel",
      "cap-1",
      "--json",
    ])
    const payload = JSON.parse(stdout.output)

    expect(code).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload.error.message).toContain("relabel")
  })

  it("maps capsules pin and unpin to the pin route", async () => {
    const { calls } = stubJsonFetch()

    await run(["capsules", "pin", "cap-1", "--json"])
    await run(["capsules", "unpin", "cap-1", "--json"])

    expect(calls[0].url).toBe(`${base}/capsules/cap-1/pin`)
    expect(calls[0].body).toEqual({ pinned: true })
    expect(calls[1].body).toEqual({ pinned: false })
  })

  it("maps capsules prune with --keep", async () => {
    const { calls } = stubJsonFetch()
    const { code } = await run([
      "capsules",
      "prune",
      "pill-1",
      "--keep",
      "3",
      "--json",
    ])

    expect(code).toBe(0)
    expect(calls[0].method).toBe("POST")
    expect(calls[0].url).toBe(`${base}/pills/pill-1/capsules/prune`)
    expect(calls[0].body).toEqual({ keep: 3 })
  })

  it("rejects a non-numeric --keep", async () => {
    const { fetchMock } = stubJsonFetch()
    const { code, stdout } = await run([
      "capsules",
      "prune",
      "pill-1",
      "--keep",
      "abc",
      "--json",
    ])
    const payload = JSON.parse(stdout.output)

    expect(code).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload.error.message).toContain("--keep")
  })

  it("maps pills run --use-capsule", async () => {
    const { calls } = stubJsonFetch()
    const { code } = await run([
      "pills",
      "run",
      "pill-1",
      "--use-capsule",
      "--json",
    ])

    expect(code).toBe(0)
    expect(calls[0].url).toBe(`${base}/pills/pill-1/start`)
    expect(calls[0].body).toMatchObject({ useCapsule: true })
  })

  it("maps pills run --capsule to a specific capsule", async () => {
    const { calls } = stubJsonFetch()
    const { code } = await run([
      "pills",
      "run",
      "pill-1",
      "--capsule",
      "cap-1",
      "--target",
      "preview",
      "--json",
    ])

    expect(code).toBe(0)
    expect(calls[0].body).toMatchObject({
      useCapsule: true,
      capsuleId: "cap-1",
      deployTarget: "preview",
    })
  })

  it("rejects a preview deploy without a capsule client-side", async () => {
    const { fetchMock } = stubJsonFetch()
    const { code, stdout } = await run([
      "pills",
      "run",
      "pill-1",
      "--target",
      "preview",
      "--json",
    ])
    const payload = JSON.parse(stdout.output)

    expect(code).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload.error.message).toContain("Preview deploys require a capsule")
  })

  it("rejects an invalid deploy target client-side", async () => {
    const { fetchMock } = stubJsonFetch()
    const { code, stdout } = await run([
      "pills",
      "run",
      "pill-1",
      "--target",
      "bogus",
      "--json",
    ])
    const payload = JSON.parse(stdout.output)

    expect(code).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload.error.message).toContain("Invalid --target")
  })

  it("maps pills update to a PATCH with the input body", async () => {
    const inputPath = join(configDir, "update.json")
    writeFileSync(
      inputPath,
      JSON.stringify({ name: "Renamed", defaultEnv: "dev" })
    )
    const { calls } = stubJsonFetch()
    const { code } = await run([
      "pills",
      "update",
      "pill-1",
      "--input",
      inputPath,
      "--json",
    ])

    expect(code).toBe(0)
    expect(calls[0].method).toBe("PATCH")
    expect(calls[0].url).toBe(`${base}/pills/pill-1`)
    expect(calls[0].body).toEqual({ name: "Renamed", defaultEnv: "dev" })
  })

  it("requires --input for pills update", async () => {
    const { fetchMock } = stubJsonFetch()
    const { code, stdout } = await run(["pills", "update", "pill-1", "--json"])
    const payload = JSON.parse(stdout.output)

    expect(code).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload.error.message).toContain("--input")
  })

  it("maps pills diagnostics to GET and --clear to POST", async () => {
    const { calls } = stubJsonFetch()

    await run(["pills", "diagnostics", "pill-1", "--json"])
    await run(["pills", "diagnostics", "pill-1", "--clear", "--json"])

    expect(calls[0].method).toBe("GET")
    expect(calls[0].url).toBe(`${base}/pills/pill-1/diagnostics`)
    expect(calls[1].method).toBe("POST")
    expect(calls[1].url).toBe(`${base}/pills/pill-1/diagnostics`)
  })

  it("maps runtime to the runtime route", async () => {
    const { calls } = stubJsonFetch()
    const { code } = await run(["runtime", "--json"])

    expect(code).toBe(0)
    expect(calls[0].url).toBe(`${base}/runtime`)
  })

  it("prints the CLI version without calling the control plane", async () => {
    const { fetchMock } = stubJsonFetch()
    const { code, stdout } = await run(["--version"])

    expect(code).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(stdout.output.trim()).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
  })
})
