export type DesktopServiceState = {
  supported: boolean
  installed: boolean
  running: boolean
  origin: string | null
}

export type DesktopWindowEvent =
  | { type: "toggle-sidebar" }
  | { type: "fullscreen"; active: boolean }
  | { type: "navigate"; to: string }

export type DesktopBridge = {
  platform: string
  pickFolder: () => Promise<string | null>
  revealInFileManager: (path: string) => Promise<void>
  getServiceState: () => Promise<DesktopServiceState>
  installService: () => Promise<DesktopServiceState>
  installCli: () => Promise<{ path: string }>
  onWindowEvent: (listener: (event: DesktopWindowEvent) => void) => () => void
}
