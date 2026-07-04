import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  createAdmin,
  endSession,
  getSession,
  hasAdmin,
  isAdminPassphraseAllowedForCurrentRequest,
  startSession,
  verifyAdmin,
} from "@/features/auth/auth.server"

const setupSchema = z.object({
  passphrase: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(1024, "Passphrase is too long."),
})

const loginSchema = z.object({
  passphrase: z.string().min(1).max(1024),
})

export const getAuthStatusFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const [admin, session] = await Promise.all([hasAdmin(), getSession()])
    return {
      hasAdmin: admin,
      authenticated: Boolean(session),
      pairingRequired: !isAdminPassphraseAllowedForCurrentRequest(),
    }
  }
)

export const setupAdminFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => setupSchema.parse(data))
  .handler(async ({ data }) => {
    await createAdmin(data.passphrase)
    await startSession()
    return { ok: true }
  })

export const loginFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => loginSchema.parse(data))
  .handler(async ({ data }) => {
    const ok = await verifyAdmin(data.passphrase)
    if (!ok) {
      throw new Error("Invalid passphrase.")
    }

    await startSession()
    return { ok: true }
  })

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  await endSession()
  return { ok: true }
})
