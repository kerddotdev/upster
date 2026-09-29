import { describe, expect, it } from "vitest"

import {
  isLocalHostName,
  isLoopbackBindHost,
  isPrivilegedLocalRequest,
  isSessionKindAllowedForRequest,
  isTailnetIdentityMismatch,
  readRequestOriginInfo,
  readTailnetIdentity,
  type RequestOriginInfo,
} from "@/features/auth/admin-origin"

const directLocal: RequestOriginInfo = {
  host: "127.0.0.1:3377",
  cameThroughProxy: false,
  tailnetIdentity: null,
}

const proxiedLocal: RequestOriginInfo = {
  host: "127.0.0.1:3377",
  cameThroughProxy: true,
  tailnetIdentity: null,
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
        {
          host: "host.example.ts.net:8443",
          cameThroughProxy: true,
          tailnetIdentity: null,
        },
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
        {
          host: "host.example.ts.net:8443",
          cameThroughProxy: true,
          tailnetIdentity: null,
        },
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
      tailnetIdentity: null,
    })
  })

  it("treats a request without forwarding headers as direct", () => {
    const headers = new Map<string, string>([["host", "127.0.0.1:3377"]])

    expect(readRequestOriginInfo((name) => headers.get(name))).toEqual({
      host: "127.0.0.1:3377",
      cameThroughProxy: false,
      tailnetIdentity: null,
    })
  })
})

describe("tailnet identity extraction", () => {
  it("reads the tailscale login only when proxied", () => {
    const headers = new Map<string, string>([
      ["tailscale-user-login", "alice@example.com"],
    ])

    expect(readTailnetIdentity((name) => headers.get(name), true)).toBe(
      "alice@example.com"
    )
    expect(readTailnetIdentity((name) => headers.get(name), false)).toBe(null)
  })

  it("ignores a spoofed identity header on a direct request", () => {
    const headers = new Map<string, string>([
      ["host", "127.0.0.1:3377"],
      ["tailscale-user-login", "attacker@example.com"],
    ])

    const info = readRequestOriginInfo((name) => headers.get(name))
    expect(info.cameThroughProxy).toBe(false)
    expect(info.tailnetIdentity).toBe(null)
  })

  it("captures the identity when a forwarding header is present", () => {
    const headers = new Map<string, string>([
      ["host", "host.example.ts.net"],
      ["x-forwarded-for", "100.64.1.2"],
      ["tailscale-user-login", "alice@example.com"],
    ])

    const info = readRequestOriginInfo((name) => headers.get(name))
    expect(info.cameThroughProxy).toBe(true)
    expect(info.tailnetIdentity).toBe("alice@example.com")
  })
})

describe("tailnet identity binding", () => {
  const proxied = (identity: string | null): RequestOriginInfo => ({
    host: "host.example.ts.net",
    cameThroughProxy: true,
    tailnetIdentity: identity,
  })

  it("allows a matching identity through the proxy", () => {
    expect(
      isTailnetIdentityMismatch(
        "alice@example.com",
        proxied("alice@example.com")
      )
    ).toBe(false)
  })

  it("rejects a different identity through the proxy", () => {
    expect(
      isTailnetIdentityMismatch(
        "alice@example.com",
        proxied("mallory@example.com")
      )
    ).toBe(true)
  })

  it("rejects a missing live identity through the proxy", () => {
    expect(isTailnetIdentityMismatch("alice@example.com", proxied(null))).toBe(
      true
    )
  })

  it("does not enforce when no identity was captured", () => {
    expect(
      isTailnetIdentityMismatch(null, proxied("mallory@example.com"))
    ).toBe(false)
  })

  it("does not enforce on a direct (non-proxied) request", () => {
    expect(
      isTailnetIdentityMismatch("alice@example.com", {
        host: "127.0.0.1:3377",
        cameThroughProxy: false,
        tailnetIdentity: null,
      })
    ).toBe(false)
  })
})
