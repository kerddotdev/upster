export type CapsuleStatus = "building" | "ready" | "error"

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm"

export type CapsuleGitMetadata = {
  commit: string | null
  branch: string | null
  message: string | null
  dirty: boolean | null
}

export type Capsule = {
  id: string
  pillId: string
  status: CapsuleStatus
  path: string
  sourcePath: string
  includeNodeModules: boolean
  installDeps: boolean
  packageManager: PackageManager | null
  label: string | null
  pinned: boolean
  git: CapsuleGitMetadata
  sizeBytes: number | null
  fileCount: number | null
  buildDurationMs: number | null
  buildLog: string | null
  error: string | null
  builtAt: string | null
  createdAt: string
  updatedAt: string
}

export type CapsuleSourceInfo = {
  hasNodeModules: boolean
  supportsInstall: boolean
  detectedManager: PackageManager | null
}

export type CapsuleInfo = {
  pillId: string
  capsules: Array<Capsule>
  source: CapsuleSourceInfo
  diskBytes: number
}

export type BuildCapsuleInput = {
  pillId: string
  includeNodeModules: boolean
  installDeps: boolean
  label?: string
}
