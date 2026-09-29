import { existsSync, realpathSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

export function assertValidHostnameLabel(slug: string) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    throw new Error(
      "Use a valid DNS label with lowercase letters, numbers, and hyphens."
    )
  }
}

export function ensureWorkspacePath(
  path: string,
  workspaceRoots: Array<string>,
  hostWorkspaceRoot?: string | null
) {
  const resolvedPath = resolveWorkspacePath(
    path,
    workspaceRoots,
    hostWorkspaceRoot
  )
  const realPath = existsSync(resolvedPath)
    ? realpathSync(resolvedPath)
    : resolvedPath
  const allowed = workspaceRoots.some((root) => {
    const resolvedRoot = existsSync(root) ? realpathSync(root) : resolve(root)
    const distance = relative(resolvedRoot, realPath)

    return (
      distance === "" || (!distance.startsWith("..") && !isAbsolute(distance))
    )
  })

  if (!allowed) {
    throw new Error("Path is outside the configured Upster workspace roots.")
  }

  if (!existsSync(resolvedPath)) {
    throw new Error("Path does not exist.")
  }

  return resolvedPath
}

export function resolveWorkspacePath(
  path: string,
  workspaceRoots: Array<string>,
  hostWorkspaceRoot?: string | null
) {
  const resolvedPath = resolve(path)

  if (!hostWorkspaceRoot || !workspaceRoots.length) {
    return resolvedPath
  }

  const resolvedHostRoot = resolve(hostWorkspaceRoot)
  const distance = relative(resolvedHostRoot, resolvedPath)

  if (
    distance === "" ||
    (!distance.startsWith("..") && !isAbsolute(distance))
  ) {
    return resolve(workspaceRoots[0], distance)
  }

  return resolvedPath
}

export function assertAllowedCommand(
  argv: Array<string>,
  allowedCommands: Array<string>
) {
  if (!allowedCommands.length) {
    return
  }

  const executable = argv[0]

  // Require an exact match. A bare name (no path separator) resolves through the
  // operator-controlled PATH, while a path-qualified argv[0] like "./node" or
  // "/tmp/node" points at a repo- or attacker-controlled file, so basename
  // matching must not let it pass.
  if (!allowedCommands.includes(executable)) {
    throw new Error(
      `Command "${executable}" is not in the configured UPSTER_ALLOWED_COMMANDS list.`
    )
  }
}

export function parseCommand(command: string) {
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
  const argv = parts.map((part) => part.replace(/^["']|["']$/g, ""))

  if (!argv.length) {
    throw new Error("Command cannot be empty.")
  }

  return argv
}
