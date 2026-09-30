import { execFileSync, spawn } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import electron from "electron"

const launcherVersion = 1
const desktopDirectory = dirname(fileURLToPath(import.meta.url))

function compileIcon(source, output) {
  mkdirSync(output, { recursive: true })
  execFileSync("/usr/bin/xcrun", [
    "actool",
    source,
    "--compile",
    output,
    "--output-format",
    "human-readable-text",
    "--output-partial-info-plist",
    join(output, "brand-info.plist"),
    "--app-icon",
    "Upster",
    "--include-all-app-icons",
    "--enable-on-demand-resources",
    "NO",
    "--development-region",
    "en",
    "--target-device",
    "mac",
    "--minimum-deployment-target",
    "15.0",
    "--platform",
    "macosx",
  ])
  return { icon: join(output, "Upster.icns"), catalog: join(output, "Assets.car") }
}

function developmentBundle() {
  const source = join(dirname(electron), "..", "..")
  const runtime = join(desktopDirectory, ".electron-runtime")
  const bundle = join(runtime, "Upster Dev.app")
  const executable = join(bundle, "Contents", "MacOS", "Electron")
  const iconSource = join(desktopDirectory, "build", "Upster.icon")
  const metadataPath = join(runtime, "metadata.json")
  const metadata = JSON.stringify({
    launcherVersion,
    source,
    icon: Math.max(
      ...readdirSync(iconSource, { recursive: true }).map((entry) =>
        statSync(join(iconSource, entry)).mtimeMs
      )
    ),
  })
  if (
    existsSync(executable) &&
    existsSync(metadataPath) &&
    readFileSync(metadataPath, "utf8") === metadata
  ) {
    return executable
  }

  rmSync(runtime, { recursive: true, force: true })
  mkdirSync(runtime, { recursive: true })
  cpSync(source, bundle, { recursive: true, verbatimSymlinks: true })
  const plist = join(bundle, "Contents", "Info.plist")
  const info = {
    CFBundleName: "Upster Dev",
    CFBundleDisplayName: "Upster Dev",
    CFBundleIdentifier: "com.kerdofficial.upster.dev.local",
  }
  let iconReady = false
  try {
    const icons = compileIcon(iconSource, join(runtime, "brand"))
    const resources = join(bundle, "Contents", "Resources")
    cpSync(icons.icon, join(resources, "Upster.icns"))
    cpSync(icons.catalog, join(resources, "Assets.car"))
    Object.assign(info, {
      CFBundleIconFile: "Upster.icns",
      CFBundleIconName: "Upster",
    })
    iconReady = true
  } catch (error) {
    console.warn(
      `Upster dev icon unavailable, using the Electron icon: ${error instanceof Error ? error.message.split("\n")[0] : error}`
    )
  }
  for (const [key, value] of Object.entries(info)) {
    execFileSync("/usr/bin/plutil", ["-replace", key, "-string", value, plist])
  }
  execFileSync("/usr/bin/codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    "--timestamp=none",
    bundle,
  ])
  if (iconReady) {
    writeFileSync(metadataPath, metadata)
  }
  return executable
}

const executable =
  process.platform === "darwin" ? developmentBundle() : electron
const { ELECTRON_RUN_AS_NODE: _runAsNode, ...environment } = process.env
const child = spawn(executable, [desktopDirectory, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: environment,
})
child.on("exit", (code) => {
  process.exitCode = code ?? 1
})
