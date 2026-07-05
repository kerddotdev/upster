import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { authMiddleware } from "@/features/auth/auth-middleware"

const runtimeSettingsSchema = z.object({
  appPortRange: z.string().trim().min(1).optional(),
  metricsPortRange: z.string().trim().min(1).optional(),
  publicOrigin: z.string().trim().min(1).optional(),
  capsuleRetention: z.string().trim().min(1).optional(),
})

const cloudflaredBinSchema = z.object({
  cloudflaredBin: z.string().trim().min(1).max(1024),
})

export const getRuntimeSettingsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { getUpsterConfig } = await import("@/config/env.server")
    const { getRuntimeSettingsView } = await import("@/config/settings.server")
    const { isAdminPassphraseAllowedForCurrentRequest } =
      await import("@/features/auth/auth.server")

    const config = getUpsterConfig()
    const view = await getRuntimeSettingsView()

    return {
      workspaceRoots: config.workspaceRoots,
      hostWorkspaceRoot: config.hostWorkspaceRoot,
      allowedCommands: config.allowedCommands,
      localAdmin: isAdminPassphraseAllowedForCurrentRequest(),
      ...view,
    }
  })

export const updateRuntimeSettingsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => runtimeSettingsSchema.parse(data))
  .handler(async ({ data }) => {
    const { updateRuntimeSettings } = await import("@/config/settings.server")

    await updateRuntimeSettings(data)
    return { ok: true }
  })

export const updateCloudflaredBinFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => cloudflaredBinSchema.parse(data))
  .handler(async ({ data }) => {
    const { isAdminPassphraseAllowedForCurrentRequest } =
      await import("@/features/auth/auth.server")
    const { updateCloudflaredBin } = await import("@/config/settings.server")

    if (!isAdminPassphraseAllowedForCurrentRequest()) {
      throw new Error(
        "The cloudflared binary can only be changed from a local session."
      )
    }

    await updateCloudflaredBin(data.cloudflaredBin)
    return { ok: true }
  })
