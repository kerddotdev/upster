import { redirect } from "@tanstack/react-router"
import { getRequestHeader } from "@tanstack/react-start/server"

import { createAdminUser, getAdminUser } from "@/db/repositories.server"
import {
  hashPassphrase,
  verifyPassphrase,
} from "@/features/auth/passwords.server"
import {
  isPrivilegedLocalRequest,
  readRequestOriginInfo,
} from "@/features/auth/admin-origin"
import {
  endCurrentSession,
  issueSessionCookie,
  readSession,
} from "@/features/auth/session.server"

const ADMIN_ID = "admin"

export async function hasAdmin() {
  return Boolean(await getAdminUser(ADMIN_ID))
}

export async function createAdmin(passphrase: string) {
  assertAdminPassphraseAllowed()

  if (await hasAdmin()) {
    throw new Error("An admin user already exists.")
  }

  const verifier = await hashPassphrase(passphrase)
  await createAdminUser({ id: ADMIN_ID, passphraseVerifier: verifier })
}

export async function verifyAdmin(passphrase: string) {
  assertAdminPassphraseAllowed()

  const user = await getAdminUser(ADMIN_ID)
  if (!user) {
    return false
  }

  return verifyPassphrase(user.passphraseVerifier, passphrase)
}

export async function startSession() {
  assertAdminPassphraseAllowed()
  const session = await issueSessionCookie(ADMIN_ID)

  const { recordSecurityEvent } =
    await import("@/features/auth/security-audit.server")
  await recordSecurityEvent({
    type: "security.login",
    message: "Local admin signed in.",
    actorSessionId: session.id,
    actorKind: "dashboard",
    source: "login",
  })
}

export async function endSession() {
  const { lockCloudflareVault } =
    await import("@/features/secrets/vault-session.server")
  await endCurrentSession()
  await lockCloudflareVault()
}

export async function getSession() {
  return readSession()
}

export async function requireSession() {
  const session = await getSession()
  if (session) {
    return session
  }

  throw redirect({
    to: isAdminPassphraseAllowedForCurrentRequest()
      ? (await hasAdmin())
        ? "/login"
        : "/setup"
      : "/pair",
  })
}

export function isAdminPassphraseAllowedForCurrentRequest() {
  return isPrivilegedLocalRequest(
    readRequestOriginInfo(safeRequestHeader),
    process.env.UPSTER_BIND_HOST
  )
}

export function assertAdminPassphraseAllowed() {
  if (!isAdminPassphraseAllowedForCurrentRequest()) {
    throw new Error("Pairing is required from this origin.")
  }
}

function safeRequestHeader(name: string) {
  try {
    return getRequestHeader(name) ?? null
  } catch {
    return null
  }
}
