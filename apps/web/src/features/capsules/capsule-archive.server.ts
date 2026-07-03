import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname } from "node:path"
import { Readable } from "node:stream"

import { getCapsuleById } from "@/db/repositories.server"
import { buildInheritedEnv } from "@/features/processes/process-env"

export async function createCapsuleArchive(capsuleId: string) {
  const capsule = await getCapsuleById(capsuleId)

  if (!capsule || !existsSync(capsule.path)) {
    return null
  }

  const versionRoot = dirname(capsule.path)
  const child = spawn("tar", ["-czf", "-", "-C", versionRoot, "source"], {
    env: buildInheritedEnv(),
    stdio: ["ignore", "pipe", "ignore"],
  })

  return {
    stream: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    filename: `capsule-${capsuleId}.tar.gz`,
  }
}
