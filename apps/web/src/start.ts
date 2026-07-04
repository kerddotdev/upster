import { createCsrfMiddleware, createStart } from "@tanstack/react-start"

function isAllowedOrigin(value: string) {
  return (process.env.UPSTER_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .includes(value)
}

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  origin: (value, ctx) =>
    value === new URL(ctx.request.url).origin || isAllowedOrigin(value),
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}))
