import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { desktopAssetPath, resourcePath } from "./paths"

afterEach(() => vi.unstubAllEnvs())

describe("desktopAssetPath", () => {
  it.each([
    "/work/upster/apps/desktop",
    "/work/Upster Checkout/apps/desktop",
    "/opt/Upster/resources/app.asar",
    "/Applications/Upster.app/Contents/Resources/app.asar",
    "/opt/Upster/resources/app",
    "/Applications/Upster.app/Contents/Resources/app",
  ])("resolves built assets inside the runtime app root %s", (appPath) => {
    for (const asset of [
      "preload.cjs",
      "onboarding.html",
      "tray.png",
    ] as const) {
      expect(desktopAssetPath(appPath, asset)).toBe(
        join(appPath, "dist", asset)
      )
    }
  })
})

describe("resourcePath", () => {
  it.each([
    "/opt/Upster/resources",
    "/Applications/Upster.app/Contents/Resources",
  ])("keeps packaged executables outside the archive at %s", (resources) => {
    expect(resourcePath(true, resources, "/unused", "server-bundle")).toBe(
      join(resources, "server-bundle")
    )
    expect(resourcePath(true, resources, "/unused", "cli")).toBe(
      join(resources, "upster")
    )
  })

  it("resolves development resources relative to the repository", () => {
    const repoRoot = "/work/upster"
    expect(resourcePath(false, "/unused", repoRoot, "cli")).toBe(
      join(repoRoot, "apps", "cli", "dist", "upster")
    )
    vi.stubEnv("UPSTER_SERVER_BUNDLE", undefined)
    expect(resourcePath(false, "/unused", repoRoot, "server-bundle")).toBe(
      join(
        repoRoot,
        "dist",
        "server-bundle",
        `${process.platform}-${process.arch}`
      )
    )
  })

  it("preserves the development bundle override", () => {
    vi.stubEnv("UPSTER_SERVER_BUNDLE", "/custom/server-bundle")
    expect(
      resourcePath(false, "/unused", "/work/upster", "server-bundle")
    ).toBe("/custom/server-bundle")
  })
})
