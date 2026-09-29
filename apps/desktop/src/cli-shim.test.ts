import {
  mkdtempSync,
  readlinkSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { installCliShim } from "./cli-shim"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "upster-shim-"))
  writeFileSync(join(dir, "upster-cli"), "#!/bin/sh\n")
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("installCliShim", () => {
  const input = () => ({
    cliBinary: join(dir, "upster-cli"),
    dataDir: join(dir, "data"),
    home: join(dir, "home"),
  })

  it("links ~/.local/bin/upster to the staged binary and is idempotent", () => {
    const first = installCliShim(input())
    const second = installCliShim(input())
    expect(second.path).toBe(first.path)
    expect(readlinkSync(first.path)).toBe(join(dir, "data", "bin", "upster"))
  })

  it("refuses to overwrite a regular file it did not create", () => {
    mkdirSync(join(dir, "home", ".local", "bin"), { recursive: true })
    writeFileSync(join(dir, "home", ".local", "bin", "upster"), "mine")
    expect(() => installCliShim(input())).toThrow(/not created by Upster/)
  })
})
