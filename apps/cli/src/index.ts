#!/usr/bin/env bun

import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import readline from "node:readline/promises"

import {
  createFailure,
  createSuccess,
  agentForbiddenError,
  controlPlaneUnavailableError,
  getAgentGuide,
  parseScopes,
  renderAgentGuideMarkdown,
  renderCliHelp,
  type ApiEnvelope,
  type ApiFailure,
  UpsterApiError,
} from "@upster/core"

type CliOptions = {
  json: boolean
  input?: string
  output?: string
  force: boolean
  dashboardUrl: string
  token?: string
  tokenFile?: string
  noColor: boolean
  help: boolean
}

type CliConfig = {
  dashboardUrl?: string
  dashboardPort?: string
  databaseUrl?: string
  databasePort?: string
}

type CliCredentials = {
  token?: string
}

type Io = {
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
  stdin: NodeJS.ReadStream
}

const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:3377"
const LOCAL_REQUEST_ID = "cli"

export async function runCli(argv: Array<string>, io: Io = defaultIo()) {
  const parsed = parseArgv(argv)

  if (parsed.options.help || parsed.command.length === 0) {
    io.stdout.write(renderCliHelp())
    return 0
  }

  try {
    const result = await dispatch(parsed.command, parsed.options, io)
    try {
      await writeCommandResult(result, parsed.options, io)
    } catch (error) {
      const failure = localFailure(error, parsed.options.dashboardUrl)
      await writeCommandResult(
        failure,
        { ...parsed.options, output: undefined },
        io
      )
      return 1
    }
    return result.ok ? 0 : 1
  } catch (error) {
    const failure = localFailure(error, parsed.options.dashboardUrl)
    await writeCommandResult(failure, parsed.options, io)
    return 1
  }
}

function defaultIo(): Io {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
  }
}

function parseArgv(argv: Array<string>) {
  const config = readConfig()
  const options: CliOptions = {
    json: false,
    force: false,
    dashboardUrl:
      process.env.UPSTER_DASHBOARD_URL ??
      config.dashboardUrl ??
      (config.dashboardPort
        ? `http://127.0.0.1:${config.dashboardPort}`
        : undefined) ??
      DEFAULT_DASHBOARD_URL,
    noColor: false,
    help: false,
  }
  const command: Array<string> = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === "--json") {
      options.json = true
    } else if (arg === "--input") {
      options.input = argv[++i]
    } else if (arg === "--output") {
      options.output = argv[++i]
    } else if (arg === "--force") {
      options.force = true
    } else if (arg === "--dashboard-url") {
      options.dashboardUrl = stripTrailingSlash(argv[++i] ?? "")
    } else if (arg === "--token") {
      options.token = argv[++i]
    } else if (arg === "--token-file") {
      options.tokenFile = argv[++i]
    } else if (arg === "--no-color") {
      options.noColor = true
    } else if (arg === "--help" || arg === "-h") {
      options.help = true
    } else {
      command.push(arg)
    }
  }

  options.dashboardUrl = stripTrailingSlash(options.dashboardUrl)

  return { command, options }
}

async function dispatch(command: Array<string>, options: CliOptions, io: Io) {
  const [root, sub, third] = command

  if (root === "agent" && sub === "guide") {
    if (options.json) {
      return createSuccess(getAgentGuide(), LOCAL_REQUEST_ID)
    }

    io.stdout.write(renderAgentGuideMarkdown())
    return createSuccess({ printed: true }, LOCAL_REQUEST_ID)
  }

  if (root === "agent" && sub === "doctor") {
    return apiRequest("GET", "/api/cli/v1/status", options)
  }

  if (root === "status") {
    return apiRequest("GET", "/api/cli/v1/status", options)
  }

  if (root === "daemon" && sub === "status") {
    return apiRequest("GET", "/api/cli/v1/status", options)
  }

  if (root === "daemon" && sub === "start") {
    return startDaemon(options)
  }

  if (root === "config" && sub === "get") {
    return createSuccess(
      { key: third, value: readConfig()[third as keyof CliConfig] ?? null },
      LOCAL_REQUEST_ID
    )
  }

  if (root === "config" && sub === "set") {
    const value = command[3]
    const config = readConfig()

    if (
      third !== "dashboardUrl" &&
      third !== "dashboardPort" &&
      third !== "databaseUrl" &&
      third !== "databasePort"
    ) {
      throw new Error(
        "Supported config keys: dashboardUrl, dashboardPort, databaseUrl, databasePort."
      )
    }

    writeConfig({ ...config, [third]: value })
    return createSuccess({ key: third, value }, LOCAL_REQUEST_ID)
  }

  if (root === "auth" && sub === "status") {
    return createSuccess(
      {
        dashboardUrl: options.dashboardUrl,
        hasToken: Boolean(resolveToken(options)),
      },
      LOCAL_REQUEST_ID
    )
  }

  if (root === "auth" && sub === "setup") {
    assertInteractiveOnly(options, "upster auth setup")
    const passphrase = await promptRequired(io, "Admin passphrase: ")
    const result = await apiRequest("POST", "/api/cli/v1/auth/setup", options, {
      passphrase,
    })
    saveTokenFromAuth(result)
    return result
  }

  if (root === "auth" && sub === "login") {
    assertInteractiveOnly(options, "upster auth login")
    const passphrase = await promptRequired(io, "Admin passphrase: ")
    const result = await apiRequest("POST", "/api/cli/v1/auth/login", options, {
      passphrase,
    })
    saveTokenFromAuth(result)
    return result
  }

  if (root === "auth" && sub === "logout") {
    const result = await apiRequest("POST", "/api/cli/v1/auth/logout", options)
    writeCredentials({})
    return result
  }

  if (root === "sessions" && sub === "list") {
    return apiRequest("GET", "/api/cli/v1/sessions", options)
  }

  if (root === "sessions" && sub === "revoke" && third) {
    return apiRequest(
      "POST",
      `/api/cli/v1/sessions/${encodeURIComponent(third)}/revoke`,
      options
    )
  }

  if (root === "agents" && sub === "create") {
    const flags = parseCommandFlags(command.slice(2))
    const label = flags.label
    const scopes = flags.scopes
    const ttlSeconds = parseDuration(flags.ttl ?? "24h")

    if (!label || !scopes) {
      throw new Error(
        "Usage: upster agents create --label <label> --ttl 24h --scopes <scopes>."
      )
    }

    return apiRequest("POST", "/api/cli/v1/agent-sessions", options, {
      label,
      scopes: parseScopes(scopes),
      ttlSeconds,
    })
  }

  if (root === "agents" && sub === "revoke" && third) {
    return apiRequest(
      "POST",
      `/api/cli/v1/sessions/${encodeURIComponent(third)}/revoke`,
      options
    )
  }

  if (root === "vault" && sub === "status") {
    return apiRequest("GET", "/api/cli/v1/vault/status", options)
  }

  if (root === "vault" && sub === "save") {
    assertInteractiveOnly(options, "upster vault save")
    const config = {
      accountId: await promptRequired(io, "Cloudflare account ID: "),
      zoneId: await promptRequired(io, "Cloudflare zone ID: "),
      rootDomain: await promptRequired(io, "Root domain: "),
      apiToken: await promptRequired(io, "Cloudflare API token: "),
    }
    const passphrase = await promptRequired(io, "Vault passphrase: ")

    return apiRequest("POST", "/api/cli/v1/vault/save", options, {
      config,
      passphrase,
    })
  }

  if (root === "vault" && sub === "unlock") {
    assertInteractiveOnly(options, "upster vault unlock")
    const flags = parseCommandFlags(command.slice(2))
    const passphrase = await promptRequired(io, "Vault passphrase: ")

    return apiRequest("POST", "/api/cli/v1/vault/unlock", options, {
      passphrase,
      ttlSeconds: flags.ttl ? parseDuration(flags.ttl) : undefined,
    })
  }

  if (root === "vault" && sub === "lock") {
    return apiRequest("POST", "/api/cli/v1/vault/lock", options)
  }

  if (root === "vault" && sub === "delete") {
    assertInteractiveOnly(options, "upster vault delete")
    return apiRequest("DELETE", "/api/cli/v1/vault", options)
  }

  if (root === "pills" && sub === "list") {
    return apiRequest("GET", "/api/cli/v1/pills", options)
  }

  if (root === "pills" && sub === "get" && third) {
    return apiRequest(
      "GET",
      `/api/cli/v1/pills/${encodeURIComponent(third)}`,
      options
    )
  }

  if (root === "pills" && sub === "add") {
    const body = options.input
      ? await readInputJson(options)
      : await promptPillInput(options, io)
    return apiRequest("POST", "/api/cli/v1/pills", options, body)
  }

  if (root === "pills" && sub === "delete" && third) {
    return apiRequest(
      "DELETE",
      `/api/cli/v1/pills/${encodeURIComponent(third)}`,
      options
    )
  }

  if (root === "pills" && sub === "run" && third) {
    const flags = parseCommandFlags(command.slice(3))
    return apiRequest(
      "POST",
      `/api/cli/v1/pills/${encodeURIComponent(third)}/start`,
      options,
      {
        commandName: flags.command,
        expiresAt: flags.expiresAt,
        rotatePorts: flags.rotatePorts === "true" ? true : undefined,
      }
    )
  }

  if (root === "pills" && sub === "stop" && third) {
    const flags = parseCommandFlags(command.slice(3))
    return apiRequest(
      "POST",
      `/api/cli/v1/pills/${encodeURIComponent(third)}/stop`,
      options,
      { runId: flags.runId }
    )
  }

  if (root === "runs" && sub === "get" && third) {
    return apiRequest(
      "GET",
      `/api/cli/v1/runs/${encodeURIComponent(third)}`,
      options
    )
  }

  if (root === "runs" && sub === "logs" && third) {
    const flags = parseCommandFlags(command.slice(3))
    if (flags.follow === "true") {
      await streamLogs(third, options, io)
      return createSuccess({ streamed: true, runId: third }, LOCAL_REQUEST_ID)
    }

    return apiRequest(
      "GET",
      `/api/cli/v1/runs/${encodeURIComponent(third)}/logs`,
      options
    )
  }

  if (root === "runs" && sub === "metrics" && third) {
    return apiRequest(
      "GET",
      `/api/cli/v1/runs/${encodeURIComponent(third)}/metrics`,
      options
    )
  }

  throw new Error(`Unknown command: ${command.join(" ")}`)
}

async function apiRequest(
  method: string,
  path: string,
  options: CliOptions,
  body?: unknown
) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  }
  const token = resolveToken(options)

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json"
  }

  let response: Response
  try {
    response = await fetch(`${options.dashboardUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    throw controlPlaneUnavailableError({ dashboardUrl: options.dashboardUrl })
  }

  return (await response.json()) as ApiEnvelope<unknown>
}

async function streamLogs(runId: string, options: CliOptions, io: Io) {
  const token = resolveToken(options)
  const headers: Record<string, string> = {}

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(
    `${options.dashboardUrl}/api/cli/v1/runs/${encodeURIComponent(
      runId
    )}/logs/stream`,
    { headers }
  )

  if (!response.ok || !response.body) {
    const payload = (await response.json()) as ApiFailure
    throw payload.error.message
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    const text = decoder.decode(value)
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) {
        continue
      }

      const log = JSON.parse(line.slice(6)) as { chunk?: string }
      io.stdout.write(log.chunk ?? "")
    }
  }
}

async function writeCommandResult(
  envelope: ApiEnvelope<unknown>,
  options: CliOptions,
  io: Io
) {
  if (options.output) {
    writeOutputFile(options.output, envelope, options.force)
    if (options.json) {
      io.stdout.write(
        `${JSON.stringify(
          createSuccess(
            { outputPath: resolve(options.output), ok: envelope.ok },
            LOCAL_REQUEST_ID
          ),
          null,
          2
        )}\n`
      )
    } else {
      io.stdout.write(`Wrote output to ${resolve(options.output)}\n`)
    }
    return
  }

  if (options.json) {
    io.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`)
    return
  }

  io.stdout.write(renderReadable(envelope))
}

function renderReadable(envelope: ApiEnvelope<unknown>) {
  if (!envelope.ok) {
    return [
      `Error: ${envelope.error.message}`,
      `Reason: ${envelope.error.reason}`,
      `Cause: ${envelope.error.cause}`,
      `Remediation: ${envelope.error.remediation}`,
      envelope.error.requiredScopes?.length
        ? `Required scopes: ${envelope.error.requiredScopes.join(", ")}`
        : null,
      envelope.error.currentScopes?.length
        ? `Current scopes: ${envelope.error.currentScopes.join(", ")}`
        : null,
      envelope.error.docsCommand
        ? `Docs command: ${envelope.error.docsCommand}`
        : null,
      "",
    ]
      .filter(Boolean)
      .join("\n")
  }

  const data = envelope.data

  if (
    typeof data === "object" &&
    data !== null &&
    "printed" in data &&
    data.printed === true
  ) {
    return ""
  }

  if (Array.isArray(data)) {
    return `${JSON.stringify(data, null, 2)}\n`
  }

  if (typeof data === "object" && data !== null) {
    return `${JSON.stringify(data, null, 2)}\n`
  }

  return `${String(data)}\n`
}

function writeOutputFile(
  outputPath: string,
  envelope: ApiEnvelope<unknown>,
  force: boolean
) {
  const absolute = resolve(outputPath)
  if (existsSync(absolute) && !force) {
    throw new Error(`Output file already exists: ${absolute}. Use --force.`)
  }

  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, `${JSON.stringify(envelope, null, 2)}\n`, {
    mode: 0o600,
  })
}

async function readInputJson(options: CliOptions) {
  if (!options.input) {
    throw new Error("This command requires --input <file|->.")
  }

  const text =
    options.input === "-"
      ? await readStdin()
      : readFileSync(resolve(options.input), "utf-8")

  return JSON.parse(text) as unknown
}

async function promptPillInput(options: CliOptions, io: Io) {
  if (options.json) {
    throw new Error("Use --input <file|-> when creating a pill with --json.")
  }

  return {
    name: await promptRequired(io, "Pill name: "),
    slug: await promptOptional(io, "Slug (optional): "),
    repoPath: await promptRequired(io, "Repository path: "),
    defaultEnv: await promptRequired(io, "Default command name: "),
    commandName: await promptRequired(io, "Command name: "),
    command: await promptRequired(io, "Command: "),
    cwd: await promptOptional(io, "Working directory (optional): "),
    healthcheckPath: await promptOptional(io, "Healthcheck path (optional): "),
  }
}

async function readStdin() {
  const chunks: Array<Buffer> = []

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString("utf-8")
}

function assertInteractiveOnly(options: CliOptions, command: string) {
  if (options.input || options.json) {
    throw agentForbiddenError({
      action: `run ${command}`,
      command,
    })
  }
}

async function promptRequired(io: Io, label: string) {
  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stdout,
  })

  try {
    const value = (await rl.question(label)).trim()
    if (!value) {
      throw new Error("A value is required.")
    }

    return value
  } finally {
    rl.close()
  }
}

async function promptOptional(io: Io, label: string) {
  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stdout,
  })

  try {
    const value = (await rl.question(label)).trim()
    return value || undefined
  } finally {
    rl.close()
  }
}

function parseCommandFlags(args: Array<string>) {
  const flags: Record<string, string> = {}

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg.startsWith("--")) {
      continue
    }

    const key = arg.slice(2)
    const next = args[i + 1]
    if (!next || next.startsWith("--")) {
      flags[key] = "true"
    } else {
      flags[key] = next
      i += 1
    }
  }

  return flags
}

function parseDuration(value: string) {
  const match = /^(\d+)([smhd])$/.exec(value)
  if (!match) {
    throw new Error("Use a duration like 30m, 8h, or 1d.")
  }

  const amount = Number(match[1])
  const unit = match[2]
  const multiplier =
    unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400

  return amount * multiplier
}

function startDaemon(options: CliOptions) {
  if (options.json) {
    throw controlPlaneUnavailableError({ dashboardUrl: options.dashboardUrl })
  }

  const logFile = join(configDir(), "daemon.log")
  mkdirSync(configDir(), { recursive: true, mode: 0o700 })

  const child = spawn("bun", ["run", "dev"], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  })
  child.unref()

  return createSuccess(
    {
      pid: child.pid ?? null,
      logFile,
      dashboardUrl: options.dashboardUrl,
    },
    LOCAL_REQUEST_ID
  )
}

function resolveToken(options: CliOptions) {
  if (options.token) {
    return options.token
  }

  if (options.tokenFile) {
    return readFileSync(resolve(options.tokenFile), "utf-8").trim()
  }

  if (process.env.UPSTER_TOKEN) {
    return process.env.UPSTER_TOKEN.trim()
  }

  return readCredentials().token
}

function readConfig(): CliConfig {
  return readJsonFile(configFile())
}

function writeConfig(config: CliConfig) {
  writeJsonFile(configFile(), config)
}

function readCredentials(): CliCredentials {
  return readJsonFile(credentialsFile())
}

function writeCredentials(credentials: CliCredentials) {
  writeJsonFile(credentialsFile(), credentials)
}

function readJsonFile<T extends object>(file: string): T {
  if (!existsSync(file)) {
    return {} as T
  }

  return JSON.parse(readFileSync(file, "utf-8")) as T
}

function writeJsonFile(file: string, value: object) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

function saveTokenFromAuth(envelope: ApiEnvelope<unknown>) {
  if (!envelope.ok) {
    return
  }

  const data = envelope.data as { token?: string }
  if (data.token) {
    writeCredentials({ token: data.token })
  }
}

function localFailure(error: unknown, dashboardUrl: string): ApiFailure {
  if (error instanceof UpsterApiError) {
    return createFailure(error.toError(), LOCAL_REQUEST_ID)
  }

  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("Output file already exists")) {
    return createFailure(
      {
        code: "OUTPUT_FILE_EXISTS",
        message,
        reason:
          "The CLI refuses to overwrite an existing output file unless --force is set.",
        cause:
          "The --output path already exists on disk and the command did not include --force.",
        remediation:
          "Choose a new --output path or rerun the command with --force if overwriting the file is intended.",
        humanActionRequired: false,
        docsCommand: "upster --help",
      },
      LOCAL_REQUEST_ID
    )
  }

  return createFailure(
    {
      code: "CLI_ERROR",
      message,
      reason: "The CLI could not complete the command before calling Upster.",
      cause:
        "The command arguments, input file, local config, or local control plane connection failed.",
      remediation: `Run upster --help or upster agent doctor --dashboard-url ${dashboardUrl} --json for a non-mutating diagnostic check.`,
      humanActionRequired: false,
      docsCommand: "upster --help",
    },
    LOCAL_REQUEST_ID
  )
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "")
}

function configDir() {
  return process.env.UPSTER_CLI_CONFIG_DIR ?? join(homedir(), ".upster")
}

function configFile() {
  return join(configDir(), "config.json")
}

function credentialsFile() {
  return join(configDir(), "credentials.json")
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await runCli(process.argv.slice(2))
  process.exit(exitCode)
}
