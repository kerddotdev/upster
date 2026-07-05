import { createCsrfMiddleware, createStart } from "@tanstack/react-start"

import { isDerivedAllowedOrigin } from "@/features/tailscale/allowed-origins"

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  origin: (value, ctx) =>
    value === new URL(ctx.request.url).origin || isDerivedAllowedOrigin(value),
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}))
