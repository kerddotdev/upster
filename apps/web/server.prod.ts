import { serve } from "srvx"
import { serveStatic } from "srvx/static"

const serverEntry = new URL("./dist/server/server.js", import.meta.url).href
const clientDir = new URL("./dist/client", import.meta.url).pathname

const { default: handler } = await import(serverEntry)

serve({
  fetch: handler.fetch,
  middleware: [serveStatic({ dir: clientDir })],
  port: process.env.UPSTER_PORT ?? 3377,
  hostname: "0.0.0.0",
})
