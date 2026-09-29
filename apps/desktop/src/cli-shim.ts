import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export function installCliShim(input: {
  cliBinary: string
  dataDir: string
  home?: string
}) {
  if (!existsSync(input.cliBinary)) {
    throw new Error("The bundled Upster CLI was not found.")
  }

  const binDir = join(input.dataDir, "bin")
  const target = join(binDir, "upster")
  mkdirSync(binDir, { recursive: true, mode: 0o700 })
  copyFileSync(input.cliBinary, target)
  chmodSync(target, 0o755)

  const linkDir = join(input.home ?? homedir(), ".local", "bin")
  const link = join(linkDir, "upster")
  mkdirSync(linkDir, { recursive: true })

  const existing = lstatSync(link, { throwIfNoEntry: false })
  if (existing) {
    const ownsLink = existing.isSymbolicLink() && readlinkSync(link) === target
    if (!ownsLink) {
      if (!existing.isSymbolicLink()) {
        throw new Error(`${link} already exists and was not created by Upster.`)
      }
      rmSync(link)
    }
  }
  if (!existsSync(link)) {
    symlinkSync(target, link)
  }

  return { path: link }
}
