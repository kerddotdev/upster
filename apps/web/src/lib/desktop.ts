import type { DesktopBridge } from "@upster/core"

declare global {
  interface Window {
    upsterDesktop?: DesktopBridge
  }
}

export function getDesktopBridge() {
  return typeof window === "undefined" ? undefined : window.upsterDesktop
}
