import { randomUUID } from "node:crypto"

import { ZodError } from "zod"
import {
  UpsterApiError,
  createFailure,
  createSuccess,
  runtimeError,
} from "@upster/core"

export function requestId() {
  return randomUUID()
}

export function successResponse<T>(data: T, id: string) {
  return Response.json(createSuccess(data, id))
}

export function failureResponse(error: unknown, id: string) {
  const apiError = normalizeError(error)

  return Response.json(createFailure(apiError.toError(), id), {
    status: apiError.status,
  })
}

function normalizeError(error: unknown) {
  if (error instanceof UpsterApiError) {
    return error
  }

  if (error instanceof ZodError) {
    return runtimeError({
      status: 400,
      code: "INVALID_INPUT",
      message: "The request input is invalid.",
      reason:
        "The JSON body did not match the input schema expected by this command.",
      cause: "One or more required fields are missing or have the wrong type.",
      remediation:
        "Run upster agent guide and compare the command input with the documented JSON shape.",
      details: error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    })
  }

  if (error instanceof Error) {
    return runtimeError({
      code: "RUNTIME_ERROR",
      message: error.message,
      reason:
        "The Upster control plane failed while processing the requested operation.",
      cause: classifyRuntimeCause(error.message),
    })
  }

  return runtimeError({
    code: "RUNTIME_ERROR",
    message: "The Upster control plane failed.",
    reason: "An unknown runtime error occurred.",
    cause: "The thrown value was not an Error object.",
  })
}

function classifyRuntimeCause(message: string) {
  const lower = message.toLowerCase()

  if (lower.includes("already has an active run")) {
    return "The pill already has a running process. Stop it before starting a new run."
  }

  if (lower.includes("not in the configured upster_allowed_commands")) {
    return "The command is not present in the configured UPSTER_ALLOWED_COMMANDS allowlist."
  }

  if (lower.includes("eaddrinuse") || /\bport\b/.test(lower)) {
    return "A required local port is already occupied or unavailable."
  }

  if (lower.includes("cloudflared")) {
    return "The cloudflared runtime failed or is not available to the control plane."
  }

  return "The operation failed inside the local Upster runtime."
}

export async function handleCliRoute<T>(
  handler: () => Promise<T> | T,
  id: string
) {
  try {
    return successResponse(await handler(), id)
  } catch (error) {
    return failureResponse(error, id)
  }
}
