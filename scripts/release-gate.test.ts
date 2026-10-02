import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  assertComplete,
  assertDraft,
  getRelease,
  requiredAssets,
} from "./release-gate"
import type { Release } from "./release-gate"

const version = "1.2.3"
const complete = (): Release => ({
  tag_name: `v${version}`,
  draft: true,
  assets: requiredAssets(version).map((name) => ({
    name,
    size: 123,
    state: "uploaded",
  })),
})

describe("release publication gate", () => {
  it("accepts a draft with every required asset uploaded", () => {
    assert.doesNotThrow(() => assertComplete(complete(), version))
    assert.equal(requiredAssets(version).length, 26)
    assert.equal(new Set(requiredAssets(version)).size, 26)
  })

  for (const name of requiredAssets(version)) {
    it(`blocks publication without ${name}`, () => {
      const release = complete()
      release.assets = release.assets.filter((asset) => asset.name !== name)
      assert.throws(
        () => assertComplete(release, version),
        /missing or incomplete/
      )
    })
  }

  it("blocks zero-byte and unfinished uploads", () => {
    for (const incomplete of [{ size: 0 }, { state: "starter" }]) {
      const release = complete()
      Object.assign(release.assets[0], incomplete)
      assert.throws(() => assertComplete(release, version), /checksums.sha256/)
    }
  })

  it("does not accept a differently versioned installer", () => {
    const release = complete()
    release.assets.find((asset) => asset.name.endsWith(".dmg"))!.name =
      "Upster-1.0.0.dmg"
    assert.throws(() => assertComplete(release, version), /Upster-1.2.3.dmg/)
  })

  it("refuses an existing published release before any upload", () => {
    assert.throws(
      () => assertDraft({ ...complete(), draft: false }, version),
      /already public/
    )
  })

  it("refuses to publish a different tag", () => {
    assert.throws(
      () => assertComplete({ ...complete(), tag_name: "v0.1.0" }, version),
      /Expected release/
    )
  })
})

describe("release lookup", () => {
  const request = (status: number, body = "{}"): typeof fetch =>
    (async () => new Response(body, { status })) as typeof fetch

  it("allows a new release only after exhausting the release list", async () => {
    assert.equal(
      await getRelease("owner/repo", version, "test", request(200, "[]")),
      null
    )
  })

  it("fails closed on missing repository, authentication, rate-limit, and server errors", async () => {
    for (const status of [401, 403, 404, 429, 500]) {
      await assert.rejects(
        getRelease("owner/repo", version, "test", request(status)),
        new RegExp(`HTTP ${status}`)
      )
    }
  })

  it("uses the authenticated releases list to find an exact draft tag", async () => {
    const mock = (async (input, init) => {
      assert.equal(
        input,
        "https://api.github.com/repos/owner/repo/releases?per_page=100&page=1"
      )
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer test"
      )
      return new Response(
        JSON.stringify([{ ...complete(), tag_name: "v1.2.30" }, complete()])
      )
    }) as typeof fetch
    assert.deepEqual(
      await getRelease("owner/repo", version, "test", mock),
      complete()
    )
  })

  it("finds a public release beyond the first page so reruns are rejected", async () => {
    let calls = 0
    const published = { ...complete(), draft: false }
    const mock = (async (input) => {
      calls++
      assert.equal(
        input,
        `https://api.github.com/repos/owner/repo/releases?per_page=100&page=${calls}`
      )
      return new Response(
        JSON.stringify(
          calls === 1
            ? Array.from({ length: 100 }, (_, i) => ({
                ...complete(),
                tag_name: `v0.0.${i}`,
              }))
            : [published]
        )
      )
    }) as typeof fetch
    const release = await getRelease("owner/repo", version, "test", mock)
    assert.equal(calls, 2)
    assert.deepEqual(release, published)
    assert.throws(() => assertDraft(release!, version), /already public/)
  })

  it("fails closed when a later page cannot be read", async () => {
    let calls = 0
    const mock = (async () => {
      calls++
      return calls === 1
        ? new Response(
            JSON.stringify(
              Array.from({ length: 100 }, () => ({
                ...complete(),
                tag_name: "v0.1.0",
              }))
            )
          )
        : new Response("{}", { status: 403 })
    }) as typeof fetch
    await assert.rejects(
      getRelease("owner/repo", version, "test", mock),
      /HTTP 403/
    )
  })

  it("rejects a malformed release list", async () => {
    await assert.rejects(
      getRelease("owner/repo", version, "test", request(200)),
      /invalid release list/
    )
  })
})
