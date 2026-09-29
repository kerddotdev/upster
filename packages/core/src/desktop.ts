export type DesktopServiceState = {
  supported: boolean
  installed: boolean
  running: boolean
  origin: string | null
}

export type DesktopBridge = {
  pickFolder: () => Promise<string | null>
  revealInFileManager: (path: string) => Promise<void>
  getServiceState: () => Promise<DesktopServiceState>
  installService: () => Promise<DesktopServiceState>
  installCli: () => Promise<{ path: string }>
}
