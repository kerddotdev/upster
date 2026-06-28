import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Writable } from "node:stream"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

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
  delete process.env.UPSTER_CLI_CONFIG_DIR
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
    expect(stdout.output).toContain("Scopes:")
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
})
