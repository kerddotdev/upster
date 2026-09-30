import type { BrowserWindowConstructorOptions } from "electron"

export const toolbarHeight = 46
export const trafficLightPosition = { x: 16, y: 16 }

const themes = {
  light: { background: "#fcfbf9", foreground: "#1f1d1a" },
  dark: { background: "#1a1e23", foreground: "#ebe8e3" },
} as const

export function windowTheme(dark: boolean) {
  return dark ? themes.dark : themes.light
}

export function titleBarOverlay(dark: boolean) {
  const theme = windowTheme(dark)
  return {
    height: toolbarHeight,
    color: theme.background,
    symbolColor: theme.foreground,
  }
}

export function platformWindowOptions(
  platform: NodeJS.Platform,
  dark: boolean
): BrowserWindowConstructorOptions {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition,
      vibrancy: "sidebar",
      visualEffectState: "followWindow",
      backgroundColor: "#00000000",
    }
  }
  return {
    titleBarStyle: "hidden",
    titleBarOverlay: titleBarOverlay(dark),
    backgroundColor: windowTheme(dark).background,
    autoHideMenuBar: true,
  }
}
