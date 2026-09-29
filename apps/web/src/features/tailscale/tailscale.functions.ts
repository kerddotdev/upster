import { createServerFn } from "@tanstack/react-start"

import { requireScopes } from "@/features/auth/scope-middleware"
import { assertLocalAdmin } from "@/features/auth/local-admin"

const TAILSCALE_LOCAL_ONLY =
  "Tailscale can only be configured from a local session."

export const getTailscaleStatusFn = createServerFn({ method: "GET" })
  .middleware([requireScopes("connections:read")])
  .handler(async () => {
    const { getTailscaleStatus } =
      await import("@/features/tailscale/tailscale-control.server")

    return getTailscaleStatus()
  })

export const startTailscaleLoginFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("connections:manage")])
  .handler(async () => {
    await assertLocalAdmin(TAILSCALE_LOCAL_ONLY)
    const { startTailscaleLogin } =
      await import("@/features/tailscale/tailscale-control.server")

    return startTailscaleLogin()
  })

export const enableTailscaleServeFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("connections:manage")])
  .handler(async () => {
    await assertLocalAdmin(TAILSCALE_LOCAL_ONLY)
    const { enableTailscaleServe } =
      await import("@/features/tailscale/tailscale-control.server")

    return enableTailscaleServe()
  })

export const disableTailscaleServeFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("connections:manage")])
  .handler(async () => {
    const { disableTailscaleServe } =
      await import("@/features/tailscale/tailscale-control.server")

    return disableTailscaleServe()
  })
