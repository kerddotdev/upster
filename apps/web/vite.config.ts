import { readFileSync } from "node:fs"

import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version: string }

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
})

export default config
