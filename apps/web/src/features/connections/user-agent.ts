export type ParsedUserAgent = {
  browser: string | null
  os: string | null
  device: "desktop" | "mobile" | "tablet" | null
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const value = ua ?? ""

  return {
    browser: parseBrowser(value),
    os: parseOs(value),
    device: parseDevice(value),
  }
}

function parseBrowser(ua: string) {
  if (/Edg\//.test(ua)) {
    return "Edge"
  }
  if (/Firefox\//.test(ua)) {
    return "Firefox"
  }
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) {
    return "Chrome"
  }
  if (/Safari\//.test(ua) && /Version\//.test(ua)) {
    return "Safari"
  }

  return null
}

function parseOs(ua: string) {
  if (/iPhone|iPad|iPod/.test(ua)) {
    return "iOS"
  }
  if (/Android/.test(ua)) {
    return "Android"
  }
  if (/Mac OS X|Macintosh/.test(ua)) {
    return "macOS"
  }
  if (/Windows NT/.test(ua)) {
    return "Windows"
  }
  if (/Linux/.test(ua)) {
    return "Linux"
  }

  return null
}

function parseDevice(ua: string): ParsedUserAgent["device"] {
  if (/iPad|Tablet/.test(ua)) {
    return "tablet"
  }
  if (/Mobile|iPhone|Android/.test(ua)) {
    return "mobile"
  }
  if (ua) {
    return "desktop"
  }

  return null
}
