import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  acquireServiceLock,
  clearRuntimeState,
  defaultDataDir,
  readRuntimeState,
  serviceLockPath,
  writeRuntimeState,
} from "../src/node"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "upster-state-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("runtime state", () => {
  it("round-trips state for a live pid and clears it", () => {
    const state = {
      pid: process.pid,
      port: 3377,
      origin: "http://127.0.0.1:3377",
      version: "1.0.0",
    }
    writeRuntimeState(dir, state)
    expect(readRuntimeState(dir)).toEqual(state)
    clearRuntimeState(dir)
    expect(readRuntimeState(dir)).toBeNull()
  })

  it("ignores state whose pid is gone", () => {
    writeRuntimeState(dir, {
      pid: 2 ** 22 + 12345,
      port: 1,
      origin: "http://127.0.0.1:1",
      version: "x",
    })
    expect(readRuntimeState(dir)).toBeNull()
  })
})

describe("service lock", () => {
  it("rejects a second holder and replaces a stale lock", () => {
    writeFileSync(serviceLockPath(dir), JSON.stringify({ pid: 2 ** 22 + 999 }))
    const release = acquireServiceLock(dir)
    writeFileSync(serviceLockPath(dir), JSON.stringify({ pid: process.ppid }))
    expect(() => acquireServiceLock(dir)).toThrow(/already running/)
    release()
  })
})

describe("defaultDataDir", () => {
  it("uses platform conventions", () => {
    expect(defaultDataDir({}, "darwin", "/Users/a")).toBe(
      "/Users/a/Library/Application Support/Upster"
    )
    expect(defaultDataDir({}, "linux", "/home/a")).toBe(
      "/home/a/.local/share/upster"
    )
    expect(defaultDataDir({ XDG_DATA_HOME: "/x" }, "linux", "/home/a")).toBe(
      "/x/upster"
    )
  })
})

describe("dev flavor", () => {
  it("uses separate data dirs", () => {
    expect(defaultDataDir({ UPSTER_FLAVOR: "dev" }, "darwin", "/Users/a")).toBe(
      "/Users/a/Library/Application Support/Upster Dev"
    )
    expect(defaultDataDir({ UPSTER_FLAVOR: "dev" }, "linux", "/home/a")).toBe(
      "/home/a/.local/share/upster-dev"
    )
  })
})
