const assert = require("node:assert/strict")
const { mkdtempSync, rmSync } = require("node:fs")
const { tmpdir } = require("node:os")
const { join, resolve } = require("node:path")
const { pathToFileURL } = require("node:url")
const { app, nativeImage } = require("electron")

const appRoot = resolve(process.argv[2] || join(__dirname, ".."))
const home = mkdtempSync(join(tmpdir(), "upster-desktop-smoke-"))
process.env.HOME = home
process.env.UPSTER_DATA_DIR = join(home, "data")
app.setPath("userData", join(home, "electron"))
app.setAppPath(appRoot)

const images = []
const createImage = nativeImage.createFromPath.bind(nativeImage)
nativeImage.createFromPath = (path) => {
  const image = createImage(path)
  images.push({ path, empty: image.isEmpty() })
  return image
}

const timeout = setTimeout(() => {
  console.error("Desktop smoke test timed out")
  cleanup()
  app.exit(1)
}, 20_000)

function cleanup() {
  clearTimeout(timeout)
  rmSync(home, { recursive: true, force: true })
}

app.on("will-quit", cleanup)

app.once("web-contents-created", (_event, contents) => {
  contents.once("did-finish-load", async () => {
    try {
      assert.equal(app.getAppPath(), appRoot)
      assert.equal(
        contents.getURL(),
        pathToFileURL(join(appRoot, "dist", "onboarding.html")).href
      )
      assert.deepEqual(images, [
        {
          path: join(
            appRoot,
            "dist",
            process.platform === "darwin" ? "trayTemplate.png" : "tray.png"
          ),
          empty: false,
        },
      ])
      const result = await contents.executeJavaScript(`(async () => ({
        title: document.title,
        onboarding: document.querySelector("h1")?.textContent,
        install: typeof window.upsterDesktop?.installService,
        state: await window.upsterDesktop.getServiceState()
      }))()`)
      assert.equal(result.title, "Upster")
      assert.equal(result.onboarding, "Set up Upster")
      assert.equal(result.install, "function")
      assert.deepEqual(result.state, {
        supported: true,
        installed: false,
        running: false,
        origin: null,
      })
      const preferences = contents.getLastWebPreferences()
      assert.equal(preferences.sandbox, true)
      assert.equal(preferences.contextIsolation, true)
      assert.equal(preferences.nodeIntegration, false)
      console.log(
        "Desktop smoke passed: onboarding, tray, preload and service IPC"
      )
      app.quit()
    } catch (error) {
      console.error(error)
      cleanup()
      app.exit(1)
    }
  })
})

require(join(appRoot, "dist", "main.cjs"))
