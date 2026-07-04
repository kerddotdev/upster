import { open, readdir, stat } from "node:fs/promises"
import { isAbsolute, join, relative, resolve } from "node:path"

import { getCapsuleById } from "@/db/repositories.server"
import type {
  CapsuleFilePreview,
  CapsuleTreeEntry,
} from "@/features/capsules/types"

const MAX_PREVIEW_BYTES = 256 * 1024

function safeJoin(root: string, relPath: string) {
  const target = resolve(root, relPath || ".")
  const distance = relative(root, target)

  if (distance.startsWith("..") || isAbsolute(distance)) {
    throw new Error("Path escapes the capsule.")
  }

  return target
}

async function requireCapsulePath(capsuleId: string) {
  const capsule = await getCapsuleById(capsuleId)

  if (!capsule) {
    throw new Error("Capsule not found.")
  }

  return capsule.path
}

export async function listCapsuleDir(capsuleId: string, relPath = "") {
  const root = await requireCapsulePath(capsuleId)
  const dir = safeJoin(root, relPath)
  const entries = await readdir(dir, { withFileTypes: true })
  const result: Array<CapsuleTreeEntry> = []

  for (const entry of entries) {
    const childRel = join(relPath, entry.name)

    if (entry.isDirectory()) {
      result.push({ name: entry.name, path: childRel, type: "dir", size: null })
    } else if (entry.isFile()) {
      const info = await stat(join(dir, entry.name))
      result.push({
        name: entry.name,
        path: childRel,
        type: "file",
        size: info.size,
      })
    }
  }

  result.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "dir" ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return { capsuleId, path: relPath, entries: result }
}

export async function readCapsuleFile(
  capsuleId: string,
  relPath: string
): Promise<CapsuleFilePreview> {
  const root = await requireCapsulePath(capsuleId)
  const file = safeJoin(root, relPath)
  const info = await stat(file)

  if (!info.isFile()) {
    throw new Error("Not a file.")
  }

  const handle = await open(file, "r")
  try {
    const buffer = Buffer.alloc(Math.min(info.size, MAX_PREVIEW_BYTES))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const slice = buffer.subarray(0, bytesRead)
    const binary = slice.includes(0)

    return {
      path: relPath,
      size: info.size,
      truncated: info.size > MAX_PREVIEW_BYTES,
      binary,
      content: binary ? null : slice.toString("utf-8"),
    }
  } finally {
    await handle.close()
  }
}
