import { contextBridge, ipcRenderer } from "electron"

import type { DesktopBridge } from "@upster/core"

const bridge: DesktopBridge = {
  pickFolder: () => ipcRenderer.invoke("desktop:pick-folder"),
  revealInFileManager: (path) => ipcRenderer.invoke("desktop:reveal", path),
  getServiceState: () => ipcRenderer.invoke("desktop:service-state"),
  installService: () => ipcRenderer.invoke("desktop:install-service"),
  installCli: () => ipcRenderer.invoke("desktop:install-cli"),
}

contextBridge.exposeInMainWorld("upsterDesktop", bridge)
