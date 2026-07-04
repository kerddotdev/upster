import { redirect } from "@tanstack/react-router"
import { getRequestHeader } from "@tanstack/react-start/server"

import { createAdminUser, getAdminUser } from "@/db/repositories.server"
import {
  hashPassphrase,
  verifyPassphrase,
} from "@/features/auth/passwords.server"
import { isAdminPassphraseAllowedForHost } from "@/features/auth/admin-origin"
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
  await issueSessionCookie(ADMIN_ID)
}

export async function endSession() {
  await endCurrentSession()
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
  return isAdminPassphraseAllowedForHost(getRequestHost())
}

export function assertAdminPassphraseAllowed() {
  if (!isAdminPassphraseAllowedForCurrentRequest()) {
    throw new Error("Pairing is required from this origin.")
  }
}

function getRequestHost() {
  try {
    return getRequestHeader("host") ?? null
  } catch {
    return null
  }
}
