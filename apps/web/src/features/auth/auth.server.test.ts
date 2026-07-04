import { describe, expect, it } from "vitest"

import {
  isAdminPassphraseAllowedForHost,
  isSessionKindAllowedForHost,
} from "@/features/auth/admin-origin"

describe("admin passphrase origin policy", () => {
  it("allows local admin passphrase origins", () => {
    expect(isAdminPassphraseAllowedForHost("127.0.0.1:3377")).toBe(true)
    expect(isAdminPassphraseAllowedForHost("localhost:3377")).toBe(true)
    expect(isAdminPassphraseAllowedForHost("[::1]:3377")).toBe(true)
    expect(isAdminPassphraseAllowedForHost("upster.upster.orb.local")).toBe(
      true
    )
  })

  it("requires pairing for network origins", () => {
    expect(isAdminPassphraseAllowedForHost("192.168.1.10:3377")).toBe(false)
    expect(isAdminPassphraseAllowedForHost("100.64.1.2:3377")).toBe(false)
    expect(isAdminPassphraseAllowedForHost("host.example.ts.net:8443")).toBe(
      false
    )
  })

  it("rejects dashboard sessions on network origins", () => {
    expect(isSessionKindAllowedForHost("dashboard", "127.0.0.1:3377")).toBe(
      true
    )
    expect(isSessionKindAllowedForHost("dashboard", "100.64.1.2:3377")).toBe(
      false
    )
    expect(isSessionKindAllowedForHost("connection", "100.64.1.2:3377")).toBe(
      true
    )
  })
})
