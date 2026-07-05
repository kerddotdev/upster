import { describe, expect, it } from "vitest"

import {
  isLocalHostName,
  isLoopbackBindHost,
  isPrivilegedLocalRequest,
  isSessionKindAllowedForRequest,
  readRequestOriginInfo,
  type RequestOriginInfo,
} from "@/features/auth/admin-origin"

const directLocal: RequestOriginInfo = {
  host: "127.0.0.1:3377",
  cameThroughProxy: false,
}

const proxiedLocal: RequestOriginInfo = {
  host: "127.0.0.1:3377",
  cameThroughProxy: true,
}

describe("local host name policy", () => {
  it("recognizes loopback and orb hosts", () => {
    expect(isLocalHostName("127.0.0.1:3377")).toBe(true)
    expect(isLocalHostName("localhost:3377")).toBe(true)
    expect(isLocalHostName("[::1]:3377")).toBe(true)
    expect(isLocalHostName("upster.upster.orb.local")).toBe(true)
  })

  it("rejects network host names", () => {
    expect(isLocalHostName("192.168.1.10:3377")).toBe(false)
    expect(isLocalHostName("100.64.1.2:3377")).toBe(false)
    expect(isLocalHostName("host.example.ts.net:8443")).toBe(false)
    expect(isLocalHostName(null)).toBe(false)
  })
})

describe("loopback bind host policy", () => {
  it("treats unset and loopback binds as loopback", () => {
    expect(isLoopbackBindHost(undefined)).toBe(true)
    expect(isLoopbackBindHost("")).toBe(true)
    expect(isLoopbackBindHost("127.0.0.1")).toBe(true)
    expect(isLoopbackBindHost("localhost")).toBe(true)
    expect(isLoopbackBindHost("::1")).toBe(true)
  })

  it("treats network binds as non-loopback", () => {
    expect(isLoopbackBindHost("0.0.0.0")).toBe(false)
    expect(isLoopbackBindHost("192.168.1.10")).toBe(false)
    expect(isLoopbackBindHost("::")).toBe(false)
  })
})

describe("privileged local request policy", () => {
  it("allows a direct loopback request on a loopback bind", () => {
    expect(isPrivilegedLocalRequest(directLocal, "127.0.0.1")).toBe(true)
    expect(isPrivilegedLocalRequest(directLocal, undefined)).toBe(true)
  })

  it("denies a spoofed local host when directly network exposed", () => {
    expect(isPrivilegedLocalRequest(directLocal, "0.0.0.0")).toBe(false)
  })

  it("denies proxied requests even when the host header looks local", () => {
    expect(isPrivilegedLocalRequest(proxiedLocal, "127.0.0.1")).toBe(false)
  })

  it("denies genuine network hosts", () => {
    expect(
      isPrivilegedLocalRequest(
        { host: "host.example.ts.net:8443", cameThroughProxy: true },
        "127.0.0.1"
      )
    ).toBe(false)
  })
})

describe("session kind policy", () => {
  it("only allows dashboard sessions on privileged local requests", () => {
    expect(
      isSessionKindAllowedForRequest("dashboard", directLocal, "127.0.0.1")
    ).toBe(true)
    expect(
      isSessionKindAllowedForRequest("dashboard", proxiedLocal, "127.0.0.1")
    ).toBe(false)
    expect(
      isSessionKindAllowedForRequest("dashboard", directLocal, "0.0.0.0")
    ).toBe(false)
  })

  it("always allows connection sessions regardless of origin", () => {
    expect(
      isSessionKindAllowedForRequest("connection", proxiedLocal, "0.0.0.0")
    ).toBe(true)
    expect(
      isSessionKindAllowedForRequest(
        "connection",
        { host: "host.example.ts.net:8443", cameThroughProxy: true },
        "127.0.0.1"
      )
    ).toBe(true)
  })
})

describe("request origin info extraction", () => {
  it("flags forwarding headers as proxied", () => {
    const headers = new Map<string, string>([
      ["host", "127.0.0.1:3377"],
      ["x-forwarded-proto", "https"],
    ])

    expect(readRequestOriginInfo((name) => headers.get(name))).toEqual({
      host: "127.0.0.1:3377",
      cameThroughProxy: true,
    })
  })

  it("treats a request without forwarding headers as direct", () => {
    const headers = new Map<string, string>([["host", "127.0.0.1:3377"]])

    expect(readRequestOriginInfo((name) => headers.get(name))).toEqual({
      host: "127.0.0.1:3377",
      cameThroughProxy: false,
    })
  })
})
