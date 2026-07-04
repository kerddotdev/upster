import { describe, expect, it, vi } from "vitest"

import {
  CloudflareClient,
  UPSTER_DNS_COMMENT,
} from "@/features/cloudflare/client.server"

const config = {
  accountId: "account",
  zoneId: "zone",
  rootDomain: "example.com",
  apiToken: "token",
}

function jsonResponse(result: unknown) {
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function errorResponse(message: string) {
  return new Response(
    JSON.stringify({
      success: false,
      errors: [{ code: 1000, message }],
      result: null,
    }),
    {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }
  )
}

describe("CloudflareClient", () => {
  it("creates and configures a tunnel through the API", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({ id: "tunnel-id", name: "upster-example" })
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "dns-id",
          name: "sample.example.com",
          content: "tunnel-id.cfargotunnel.com",
        })
      )
      .mockResolvedValueOnce(jsonResponse("runtime-token"))

    const client = new CloudflareClient(config, fetcher)
    const tunnel = await client.getOrCreateRemoteTunnel("upster-example")
    await client.updateTunnelConfig({
      tunnelId: tunnel.id,
      hostname: "sample.example.com",
      appPort: 41000,
    })
    const record = await client.ensureDnsRecord({
      hostname: "sample.example.com",
      tunnelId: tunnel.id,
    })
    const token = await client.fetchTunnelToken(tunnel.id)

    expect(tunnel.id).toBe("tunnel-id")
    expect(record.id).toBe("dns-id")
    expect(token).toBe("runtime-token")
    expect(fetcher).toHaveBeenCalledTimes(6)
  })

  it("reuses an existing tunnel when Cloudflare reports a duplicate name", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        errorResponse(
          "You already have a tunnel with this name. Delete the existing tunnel, or choose a different name for your new tunnel"
        )
      )
      .mockResolvedValueOnce(
        jsonResponse([{ id: "existing-tunnel-id", name: "upster-example" }])
      )

    const client = new CloudflareClient(config, fetcher)
    const tunnel = await client.getOrCreateRemoteTunnel("upster-example")

    expect(tunnel.id).toBe("existing-tunnel-id")
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it("updates an existing dns record it owns when it points to another tunnel", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: "dns-id",
            name: "sample.example.com",
            content: "old-tunnel.cfargotunnel.com",
            comment: UPSTER_DNS_COMMENT,
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "dns-id",
          name: "sample.example.com",
          content: "new-tunnel.cfargotunnel.com",
          comment: UPSTER_DNS_COMMENT,
        })
      )

    const client = new CloudflareClient(config, fetcher)
    const record = await client.ensureDnsRecord({
      hostname: "sample.example.com",
      tunnelId: "new-tunnel",
    })

    expect(record.content).toBe("new-tunnel.cfargotunnel.com")
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenLastCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone/dns_records/dns-id",
      expect.objectContaining({ method: "PUT" })
    )
  })

  it("refuses to overwrite a dns record it does not own", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      jsonResponse([
        {
          id: "foreign-id",
          name: "sample.example.com",
          content: "someone-else.example.com",
        },
      ])
    )

    const client = new CloudflareClient(config, fetcher)

    await expect(
      client.ensureDnsRecord({
        hostname: "sample.example.com",
        tunnelId: "new-tunnel",
      })
    ).rejects.toThrow(/not managed by Upster/)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("updates the record referenced by existingRecordId when Upster owns it", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: "dns-id",
          name: "sample.example.com",
          content: "old-tunnel.cfargotunnel.com",
          comment: UPSTER_DNS_COMMENT,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "dns-id",
          name: "sample.example.com",
          content: "new-tunnel.cfargotunnel.com",
          comment: UPSTER_DNS_COMMENT,
        })
      )

    const client = new CloudflareClient(config, fetcher)
    const record = await client.ensureDnsRecord({
      hostname: "sample.example.com",
      tunnelId: "new-tunnel",
      existingRecordId: "dns-id",
    })

    expect(record.content).toBe("new-tunnel.cfargotunnel.com")
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenLastCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone/dns_records/dns-id",
      expect.objectContaining({ method: "PUT" })
    )
  })

  it("refuses to overwrite a stored record id owned by someone else", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        id: "dns-id",
        name: "sample.example.com",
        content: "someone-else.example.com",
        comment: "managed-by-another-tool",
      })
    )

    const client = new CloudflareClient(config, fetcher)

    await expect(
      client.ensureDnsRecord({
        hostname: "sample.example.com",
        tunnelId: "new-tunnel",
        existingRecordId: "dns-id",
      })
    ).rejects.toThrow(/not managed by Upster/)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("heals a stored record created before ownership tagging", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: "dns-id",
          name: "sample.example.com",
          content: "old-tunnel.cfargotunnel.com",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "dns-id",
          name: "sample.example.com",
          content: "new-tunnel.cfargotunnel.com",
          comment: UPSTER_DNS_COMMENT,
        })
      )

    const client = new CloudflareClient(config, fetcher)
    const record = await client.ensureDnsRecord({
      hostname: "sample.example.com",
      tunnelId: "new-tunnel",
      existingRecordId: "dns-id",
    })

    expect(record.content).toBe("new-tunnel.cfargotunnel.com")
    expect(fetcher).toHaveBeenLastCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone/dns_records/dns-id",
      expect.objectContaining({ method: "PUT" })
    )
  })

  it("deletes the dns record and tunnel during cleanup", async () => {
    const fetcher = vi.fn(async () => jsonResponse(null))

    const client = new CloudflareClient(config, fetcher)
    await client.deleteDnsRecord("dns-id")
    await client.deleteTunnel("tunnel-id")

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://api.cloudflare.com/client/v4/zones/zone/dns_records/dns-id",
      expect.objectContaining({ method: "DELETE" })
    )
    // deleteTunnel clears stale connections first, then deletes the tunnel.
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://api.cloudflare.com/client/v4/accounts/account/cfd_tunnel/tunnel-id/connections",
      expect.objectContaining({ method: "DELETE" })
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "https://api.cloudflare.com/client/v4/accounts/account/cfd_tunnel/tunnel-id",
      expect.objectContaining({ method: "DELETE" })
    )
  })

  it("retries the tunnel delete until active connections drain", async () => {
    const fetcher = vi
      .fn()
      // attempt 1: clear connections, then delete fails with active connections
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(
        errorResponse(
          "This tunnel must be empty to be deleted, but it still has active connections"
        )
      )
      // attempt 2: clear connections, then delete succeeds
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse(null))

    const sleep = vi.fn(async () => undefined)
    const client = new CloudflareClient(config, fetcher, sleep)
    await client.deleteTunnel("tunnel-id")

    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenLastCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account/cfd_tunnel/tunnel-id",
      expect.objectContaining({ method: "DELETE" })
    )
  })

  it("stops retrying the tunnel delete on a non-connection error", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(errorResponse("Authentication error"))

    const sleep = vi.fn(async () => undefined)
    const client = new CloudflareClient(config, fetcher, sleep)

    await expect(client.deleteTunnel("tunnel-id")).rejects.toThrow(
      /Authentication error/
    )
    expect(sleep).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
