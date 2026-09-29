export type ServiceDefinition = {
  label: string
  program: Array<string>
  env: Record<string, string>
  logPath: string
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export function renderLaunchAgentPlist(definition: ServiceDefinition) {
  const args = definition.program
    .map((arg) => `    <string>${escapeXml(arg)}</string>`)
    .join("\n")
  const env = Object.entries(definition.env)
    .map(
      ([key, value]) =>
        `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`
    )
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(definition.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ExitTimeOut</key>
  <integer>30</integer>
  <key>Umask</key>
  <integer>63</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(definition.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(definition.logPath)}</string>
</dict>
</plist>
`
}

function quoteSystemd(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`
}

export function renderSystemdUnit(definition: ServiceDefinition) {
  const env = Object.entries(definition.env)
    .map(([key, value]) => `Environment=${quoteSystemd(`${key}=${value}`)}`)
    .join("\n")

  return `[Unit]
Description=Upster
After=network-online.target

[Service]
Type=simple
ExecStart=${definition.program.map(quoteSystemd).join(" ")}
${env}
Restart=on-failure
RestartSec=5
KillMode=mixed
TimeoutStopSec=30
UMask=0077
StandardOutput=append:${definition.logPath}
StandardError=append:${definition.logPath}

[Install]
WantedBy=default.target
`
}
