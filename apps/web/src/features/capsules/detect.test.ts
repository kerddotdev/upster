import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  detectPackageManager,
  resolveCapsuleCwd,
} from "@/features/capsules/detect"

const created: Array<string> = []

function makeDir() {
  const dir = mkdtempSync(join(tmpdir(), "upster-capsule-"))
  created.push(dir)
  return dir
}

function touch(dir: string, name: string) {
  writeFileSync(join(dir, name), "")
}

afterEach(() => {
  while (created.length) {
    rmSync(created.pop() as string, { recursive: true, force: true })
  }
})

describe("detectPackageManager", () => {
  it("returns null when there is no package.json", () => {
    expect(detectPackageManager(makeDir())).toBeNull()
  })

  it("detects bun from a lockfile", () => {
    const dir = makeDir()
    touch(dir, "package.json")
    touch(dir, "bun.lock")
    expect(detectPackageManager(dir)).toEqual({
      manager: "bun",
      installArgv: ["bun", "install"],
    })
  })

  it("detects pnpm, yarn, and npm from lockfiles", () => {
    const pnpm = makeDir()
    touch(pnpm, "package.json")
    touch(pnpm, "pnpm-lock.yaml")
    expect(detectPackageManager(pnpm)?.manager).toBe("pnpm")

    const yarn = makeDir()
    touch(yarn, "package.json")
    touch(yarn, "yarn.lock")
    expect(detectPackageManager(yarn)?.manager).toBe("yarn")

    const npm = makeDir()
    touch(npm, "package.json")
    touch(npm, "package-lock.json")
    expect(detectPackageManager(npm)?.manager).toBe("npm")
  })

  it("falls back to npm when only package.json exists", () => {
    const dir = makeDir()
    touch(dir, "package.json")
    expect(detectPackageManager(dir)?.manager).toBe("npm")
  })
})

describe("resolveCapsuleCwd", () => {
  it("maps the repo root to the capsule root", () => {
    expect(resolveCapsuleCwd("/work/app", "/work/app", "/data/cap")).toBe(
      "/data/cap"
    )
  })

  it("maps a subdirectory cwd into the capsule copy", () => {
    expect(
      resolveCapsuleCwd("/work/app", "/work/app/packages/web", "/data/cap")
    ).toBe("/data/cap/packages/web")
  })

  it("rejects a cwd outside the repo path", () => {
    expect(() =>
      resolveCapsuleCwd("/work/app", "/work/other", "/data/cap")
    ).toThrow(/outside the pill repo path/)
  })
})
