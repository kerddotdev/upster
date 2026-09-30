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
  detectDockerInstance: () => Promise<DockerDetection>
  migrateFromDocker: (options: MigrationOptions) => Promise<MigrationSummary>
  onMigrationEvent: (listener: (event: MigrationEvent) => void) => () => void
  resetSetup: () => Promise<boolean>
  onWindowEvent: (listener: (event: DesktopWindowEvent) => void) => () => void
}

export type DockerInstance = {
  project: string
  dbVolume: string
  dataVolume: string
  workspaceRoot: string | null
  sqldImage: string
  running: boolean
  containerIds: Array<string>
}

export type DockerDetection = {
  dockerAvailable: boolean
  instances: Array<DockerInstance>
  nativeHasData: boolean
}

export type MigrationStepId =
  | "stop"
  | "export"
  | "transform"
  | "capsules"
  | "verify"
  | "finalize"

export type MigrationEvent =
  | { type: "step"; id: MigrationStepId; label: string }
  | { type: "result"; summary: MigrationSummary }
  | { type: "error"; message: string }

export type MigrationSummary = {
  pills: number
  capsules: number
  runs: number
  logLines: number
  workspaceRoot: string
  backupPath: string | null
}

export type MigrationOptions = {
  project: string
  workspaceRoot: string | null
  stopContainers: boolean
}
