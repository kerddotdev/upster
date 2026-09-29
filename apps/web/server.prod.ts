import { serve } from "srvx"
import { serveStatic } from "srvx/static"
import {
  acquireServiceLock,
  clearRuntimeState,
  defaultDataDir,
  writeRuntimeState,
} from "@upster/core/node"
import { resolve } from "node:path"

const serverEntry = new URL("./dist/server/server.js", import.meta.url).href
const clientDir = new URL("./dist/client", import.meta.url).pathname

const dataDir = resolve(process.env.UPSTER_DATA_DIR || defaultDataDir())
const port = Number(process.env.UPSTER_PORT ?? 3377)
const hostname = process.env.UPSTER_LISTEN_HOST ?? "127.0.0.1"

const releaseLock = acquireServiceLock(dataDir)
process.on("exit", () => {
  clearRuntimeState(dataDir)
  releaseLock()
})

const { default: handler } = await import(serverEntry)

serve({
  fetch: handler.fetch,
  middleware: [serveStatic({ dir: clientDir })],
  port,
  hostname,
})

writeRuntimeState(dataDir, {
  pid: process.pid,
  port,
  origin: `http://127.0.0.1:${port}`,
  version: process.env.UPSTER_VERSION ?? "dev",
})
