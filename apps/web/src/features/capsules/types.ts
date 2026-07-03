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

export type CapsuleTreeEntry = {
  name: string
  path: string
  type: "dir" | "file"
  size: number | null
}

export type CapsuleDirListing = {
  capsuleId: string
  path: string
  entries: Array<CapsuleTreeEntry>
}

export type CapsuleFilePreview = {
  path: string
  size: number
  truncated: boolean
  binary: boolean
  content: string | null
}
