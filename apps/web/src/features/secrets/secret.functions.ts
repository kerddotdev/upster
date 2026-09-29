import { createServerFn } from "@tanstack/react-start"
import { vaultSaveSchema, vaultUnlockSchema } from "@upster/core"

import { requireScopes } from "@/features/auth/scope-middleware"

export const getCloudflareVaultStatusFn = createServerFn({ method: "GET" })
  .middleware([requireScopes("vault:status")])
  .handler(async ({ context }) => {
    const { getVaultStatus } =
      await import("@/features/secrets/vault-session.server")

    return getVaultStatus({
      sessionId: context.session.sid,
      kind: context.session.kind,
    })
  })

export const saveCloudflareVaultFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("vault:write")])
  .validator((data: unknown) => vaultSaveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { saveCloudflareVaultInteractive } =
      await import("@/features/secrets/vault-session.server")

    return saveCloudflareVaultInteractive({
      ...data,
      actor: { sessionId: context.session.sid, kind: context.session.kind },
    })
  })

export const unlockCloudflareVaultFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("vault:unlock")])
  .validator((data: unknown) => vaultUnlockSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { unlockCloudflareVault } =
      await import("@/features/secrets/vault-session.server")

    return unlockCloudflareVault({
      ...data,
      actor: { sessionId: context.session.sid, kind: context.session.kind },
    })
  })

export const lockCloudflareVaultFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("vault:unlock")])
  .handler(async ({ context }) => {
    const { lockCloudflareVault, getVaultStatus } =
      await import("@/features/secrets/vault-session.server")

    const actor = {
      sessionId: context.session.sid,
      kind: context.session.kind,
    }
    await lockCloudflareVault(actor)
    return getVaultStatus(actor)
  })

export const deleteCloudflareVaultFn = createServerFn({
  method: "POST",
})
  .middleware([requireScopes("vault:delete")])
  .handler(async ({ context }) => {
    const { deleteCloudflareVaultInteractive } =
      await import("@/features/secrets/vault-session.server")

    return deleteCloudflareVaultInteractive({
      sessionId: context.session.sid,
      kind: context.session.kind,
    })
  })
