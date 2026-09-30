/// <reference lib="dom" />
import { contextBridge, ipcRenderer } from "electron"

import type { DesktopBridge, DesktopWindowEvent } from "@upster/core"

const bridge: DesktopBridge = {
  platform: process.platform,
  pickFolder: () => ipcRenderer.invoke("desktop:pick-folder"),
  revealInFileManager: (path) => ipcRenderer.invoke("desktop:reveal", path),
  getServiceState: () => ipcRenderer.invoke("desktop:service-state"),
  installService: () => ipcRenderer.invoke("desktop:install-service"),
  installCli: () => ipcRenderer.invoke("desktop:install-cli"),
  onWindowEvent: (listener) => {
    const handler = (_event: unknown, payload: DesktopWindowEvent) =>
      listener(payload)
    ipcRenderer.on("upster:window", handler)
    return () => {
      ipcRenderer.removeListener("upster:window", handler)
    }
  },
}

function markDocument() {
  document.documentElement.dataset.desktop = ""
  document.documentElement.dataset.platform = process.platform
}

if (document.documentElement) {
  markDocument()
} else {
  document.addEventListener("readystatechange", markDocument, { once: true })
}

contextBridge.exposeInMainWorld("upsterDesktop", bridge)
