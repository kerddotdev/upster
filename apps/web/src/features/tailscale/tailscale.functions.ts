import { createServerFn } from "@tanstack/react-start"

import { requireScopes } from "@/features/auth/scope-middleware"

async function assertLocalAdmin() {
  const { isAdminPassphraseAllowedForCurrentRequest } =
    await import("@/features/auth/auth.server")

  if (!isAdminPassphraseAllowedForCurrentRequest()) {
    throw new Error("Tailscale can only be configured from a local session.")
  }
}

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
    await assertLocalAdmin()
    const { startTailscaleLogin } =
      await import("@/features/tailscale/tailscale-control.server")

    return startTailscaleLogin()
  })

export const enableTailscaleServeFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("connections:manage")])
  .handler(async () => {
    await assertLocalAdmin()
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
