import { createServerFn } from "@tanstack/react-start"
import { vaultSaveSchema, vaultUnlockSchema } from "@upster/core"

import { authMiddleware } from "@/features/auth/auth-middleware"

export const getCloudflareVaultStatusFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { getVaultStatus } =
      await import("@/features/secrets/vault-session.server")

    return getVaultStatus()
  })

export const saveCloudflareVaultFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => vaultSaveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { saveCloudflareVaultInteractive } =
      await import("@/features/secrets/vault-session.server")

    return saveCloudflareVaultInteractive({
      ...data,
      actorSessionId: context.session.sid,
    })
  })

export const unlockCloudflareVaultFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => vaultUnlockSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { unlockCloudflareVault } =
      await import("@/features/secrets/vault-session.server")

    return unlockCloudflareVault({
      ...data,
      actorSessionId: context.session.sid,
    })
  })

export const lockCloudflareVaultFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { lockCloudflareVault } =
      await import("@/features/secrets/vault-session.server")

    return lockCloudflareVault()
  })

export const deleteCloudflareVaultFn = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .handler(async () => {
    const { deleteCloudflareVaultInteractive } =
      await import("@/features/secrets/vault-session.server")

    return deleteCloudflareVaultInteractive()
  })
