import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { assertSafeDataDir, clearDataDir } from "./migration"

describe("clearDataDir", () => {
  it("deletes service data but keeps the desktop profile", () => {
    const root = mkdtempSync(join(tmpdir(), "upster-reset-"))
    const dir = join(root, "Upster")
    mkdirSync(join(dir, "desktop"), { recursive: true })
    mkdirSync(join(dir, "capsules"), { recursive: true })
    writeFileSync(join(dir, "upster.db"), "x")

    clearDataDir(dir)

    expect(existsSync(join(dir, "desktop"))).toBe(true)
    expect(existsSync(join(dir, "upster.db"))).toBe(false)
    expect(existsSync(join(dir, "capsules"))).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })

  it("refuses dangerous targets", () => {
    expect(() => assertSafeDataDir("/", "/Users/a")).toThrow(/unsafe/)
    expect(() => assertSafeDataDir("/Users/a", "/Users/a")).toThrow(/unsafe/)
    expect(() => assertSafeDataDir("/Users", "/Users/a")).toThrow(/unsafe/)
  })
})
