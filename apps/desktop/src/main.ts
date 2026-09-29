import { join } from "node:path"
import { pathToFileURL } from "node:url"

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  session,
  shell,
  Tray,
} from "electron"
import { autoUpdater } from "electron-updater"
import type { IpcMainInvokeEvent } from "electron"

import { readRuntimeState } from "@upster/core/node"

import { installCliShim } from "./cli-shim"
import { dataDir, resourcePath } from "./paths"
import {
  ensureServiceRunning,
  getServiceState,
  installBundledService,
  startService,
  stopService,
} from "./service-control"

const repoRoot = join(__dirname, "..", "..", "..")
const bundlePath = () =>
  resourcePath(app.isPackaged, process.resourcesPath, repoRoot, "server-bundle")
const cliPath = () =>
  resourcePath(app.isPackaged, process.resourcesPath, repoRoot, "cli")
const onboardingUrl = pathToFileURL(join(__dirname, "onboarding.html")).href

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function currentOrigin() {
  return readRuntimeState(dataDir())?.origin ?? null
}

function isTrustedSender(event: IpcMainInvokeEvent) {
  const url = event.senderFrame?.url
  if (!url) {
    return false
  }
  const origin = currentOrigin()
  return (
    url.startsWith(onboardingUrl) ||
    (origin !== null && (url === origin || url.startsWith(`${origin}/`)))
  )
}

function handle<T>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: Array<unknown>) => Promise<T> | T
) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      throw new Error("Untrusted sender")
    }
    return fn(event, ...args)
  })
}

function openExternalIfSafe(url: string) {
  if (url.startsWith("https://")) {
    void shell.openExternal(url)
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: "Upster",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.once("ready-to-show", () => window.show())
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault()
      window.hide()
    }
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url)
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (event, url) => {
    const origin = currentOrigin()
    const allowed =
      url.startsWith(onboardingUrl) ||
      (origin !== null && (url === origin || url.startsWith(`${origin}/`)))
    if (!allowed) {
      event.preventDefault()
      openExternalIfSafe(url)
    }
  })

  return window
}

async function showDashboard(window: BrowserWindow) {
  try {
    const runtime = await ensureServiceRunning(bundlePath())
    await window.loadURL(runtime.origin)
  } catch (error) {
    await showOnboarding(
      window,
      error instanceof Error ? error.message : String(error)
    )
  }
}

async function showOnboarding(window: BrowserWindow, error?: string) {
  const url = new URL(onboardingUrl)
  if (error) {
    url.searchParams.set("error", error)
  }
  await window.loadURL(url.href)
}

async function boot(window: BrowserWindow) {
  const state = await getServiceState()
  if (state.installed) {
    await showDashboard(window)
  } else {
    await showOnboarding(window)
  }
  await refreshTray()
}

function showWindow() {
  if (!mainWindow) {
    return
  }
  mainWindow.show()
  mainWindow.focus()
}

async function refreshTray() {
  if (!tray) {
    return
  }
  const state = await getServiceState()
  tray.setToolTip(state.running ? "Upster is running" : "Upster is stopped")
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Upster", click: showWindow },
      { type: "separator" },
      {
        label: state.running ? "Service running" : "Service stopped",
        enabled: false,
      },
      state.running
        ? {
            label: "Stop service",
            click: () => void stopService().then(refreshTray),
          }
        : {
            label: "Start service",
            enabled: state.installed,
            click: () => void startService().then(refreshTray),
          },
      { type: "separator" },
      {
        label: "Quit Upster",
        sublabel: "The background service keeps running",
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ])
  )
}

function createTray() {
  const icon = nativeImage.createFromPath(join(__dirname, "tray.png"))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.on("click", showWindow)
  void refreshTray()
  setInterval(() => void refreshTray(), 15_000).unref()
}

function registerIpc() {
  handle("desktop:pick-folder", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      properties: ["openDirectory", "createDirectory"] as Array<
        "openDirectory" | "createDirectory"
      >,
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  handle("desktop:reveal", (_event, path) => {
    if (typeof path !== "string" || !path.startsWith("/")) {
      throw new Error("Invalid path")
    }
    shell.showItemInFolder(path)
  })

  handle("desktop:service-state", () => getServiceState())

  handle("desktop:install-service", async () => {
    const runtime = await installBundledService(bundlePath())
    if (mainWindow) {
      await mainWindow.loadURL(runtime.origin)
    }
    await refreshTray()
    return getServiceState()
  })

  handle("desktop:install-cli", () =>
    installCliShim({ cliBinary: cliPath(), dataDir: dataDir() })
  )
}

function setupAutoUpdate() {
  if (!app.isPackaged) {
    return
  }
  autoUpdater.on("update-downloaded", async () => {
    const { response } = await dialog.showMessageBox({
      type: "info",
      message: "An Upster update is ready.",
      detail:
        "Restart to install it. The background service restarts with the new version.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
    })
    if (response === 0) {
      quitting = true
      autoUpdater.quitAndInstall()
    }
  })
  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined)
  check()
  setInterval(check, 4 * 60 * 60 * 1000).unref()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", showWindow)
  app.on("activate", showWindow)
  app.on("before-quit", () => {
    quitting = true
  })
  app.on("window-all-closed", () => undefined)

  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) =>
      callback(false)
    )
    registerIpc()
    mainWindow = createWindow()
    createTray()
    setupAutoUpdate()
    void boot(mainWindow)
  })
}
