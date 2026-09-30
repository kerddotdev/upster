import { migrate, detect } from "./run"

function flag(args: Array<string>, name: string) {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function print(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const dataDir = flag(args, "--data-dir")
  if (!dataDir) {
    throw new Error("--data-dir is required")
  }

  if (command === "detect") {
    print({ type: "detected", detection: await detect(dataDir) })
    return
  }

  if (command === "run") {
    const project = flag(args, "--project")
    if (!project) {
      throw new Error("--project is required")
    }
    const summary = await migrate({
      dataDir,
      project,
      workspaceRoot: flag(args, "--workspace-root") ?? null,
      stopContainers: args.includes("--stop-containers"),
      emit: print,
    })
    print({ type: "result", summary })
    return
  }

  throw new Error("Usage: migrate.mjs detect|run --data-dir <dir>")
}

main().catch((error: unknown) => {
  print({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})
