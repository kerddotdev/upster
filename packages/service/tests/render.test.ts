import { describe, expect, it } from "vitest"

import {
  buildServiceDefinition,
  renderLaunchAgentPlist,
  renderSystemdUnit,
} from "../src"

const definition = {
  label: "com.example.upster",
  program: ["/opt/node", "/opt/server.mjs"],
  env: { PATH: "/a:/b", NOTE: 'a & "b" <c>' },
  logPath: "/tmp/service.log",
}

describe("service rendering", () => {
  it("escapes launchd plist values and keeps the service alive on failure", () => {
    const plist = renderLaunchAgentPlist(definition)
    expect(plist).toContain("a &amp; &quot;b&quot; &lt;c&gt;")
    expect(plist).toContain("<key>RunAtLoad</key>")
    expect(plist).toContain("<string>/opt/server.mjs</string>")
  })

  it("renders a quoted systemd user unit", () => {
    const unit = renderSystemdUnit(definition)
    expect(unit).toContain('ExecStart="/opt/node" "/opt/server.mjs"')
    expect(unit).toContain('Environment="PATH=/a:/b"')
    expect(unit).toContain("WantedBy=default.target")
  })

  it("builds a definition with the data dir, port and roots", () => {
    const built = buildServiceDefinition(
      {
        nodePath: "/n",
        entryPath: "/e",
        dataDir: "/d",
        port: 4000,
        workspaceRoots: ["/w1", "/w2"],
      },
      "/bin"
    )
    expect(built.env).toMatchObject({
      UPSTER_DATA_DIR: "/d",
      UPSTER_PORT: "4000",
      UPSTER_WORKSPACE_ROOTS: "/w1,/w2",
      PATH: "/bin",
    })
    expect(built.logPath).toBe("/d/service.log")
  })
})

describe("service identity", () => {
  it("separates the dev flavor from production", async () => {
    const { serviceLabel, systemdUnit } = await import("../src")
    expect(serviceLabel({})).toBe("com.kerddotdev.upster")
    expect(serviceLabel({ UPSTER_FLAVOR: "dev" })).toBe(
      "com.kerddotdev.upster.dev"
    )
    expect(systemdUnit({ UPSTER_FLAVOR: "dev" })).toBe("upster-dev.service")
  })
})
