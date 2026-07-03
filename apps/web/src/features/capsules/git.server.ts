import { spawn } from "node:child_process"

import { buildInheritedEnv } from "@/features/processes/process-env"
import type { CapsuleGitMetadata } from "@/features/capsules/types"

const EMPTY_METADATA: CapsuleGitMetadata = {
  commit: null,
  branch: null,
  message: null,
  dirty: null,
}

function runGit(args: Array<string>, cwd: string) {
  return new Promise<{ code: number | null; stdout: string }>((resolve) => {
    const child = spawn("git", args, {
      cwd,
      env: buildInheritedEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", () => undefined)
    child.on("error", () => resolve({ code: -1, stdout: "" }))
    child.on("exit", (code) => resolve({ code, stdout }))
  })
}

export async function captureGitMetadata(
  repoPath: string
): Promise<CapsuleGitMetadata> {
  const inside = await runGit(["rev-parse", "--is-inside-work-tree"], repoPath)

  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
    return EMPTY_METADATA
  }

  const [commit, branch, message, status] = await Promise.all([
    runGit(["rev-parse", "HEAD"], repoPath),
    runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoPath),
    runGit(["log", "-1", "--format=%s"], repoPath),
    runGit(["status", "--porcelain"], repoPath),
  ])

  return {
    commit: commit.code === 0 ? commit.stdout.trim() || null : null,
    branch: branch.code === 0 ? branch.stdout.trim() || null : null,
    message: message.code === 0 ? message.stdout.trim() || null : null,
    dirty: status.code === 0 ? status.stdout.trim().length > 0 : null,
  }
}
