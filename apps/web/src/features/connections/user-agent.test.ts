import { describe, expect, it } from "vitest"

import { parseUserAgent } from "@/features/connections/user-agent"

describe("parseUserAgent", () => {
  it("parses desktop Chrome on macOS", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      )
    ).toEqual({
      browser: "Chrome",
      os: "macOS",
      device: "desktop",
    })
  })

  it("parses mobile Safari on iOS", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
      )
    ).toEqual({
      browser: "Safari",
      os: "iOS",
      device: "mobile",
    })
  })

  it("handles missing values", () => {
    expect(parseUserAgent(null)).toEqual({
      browser: null,
      os: null,
      device: null,
    })
  })
})
