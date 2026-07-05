import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { authMiddleware } from "@/features/auth/auth-middleware"
import { getRunLogs } from "@/db/repositories.server"
import {
  createPill,
  deletePill,
  getPillStatus,
  getPills,
  updatePill,
} from "@/features/pills/pills.server"
import {
  clearPillDiagnostics,
  getPillDiagnostics,
} from "@/features/pills/diagnostics.server"
import {
  startPillRuntime,
  stopPillRun,
} from "@/features/processes/supervisor.server"

const createPillSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  repoPath: z.string().min(1),
  defaultEnv: z.string().min(1),
  commandName: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().optional(),
  healthcheckPath: z.string().optional(),
})

const updatePillSchema = z.object({
  pillId: z.string().min(1),
  name: z.string().min(1),
  defaultEnv: z.string().min(1),
  commandName: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  healthcheckPath: z.string().nullable().optional(),
})

const pillIdSchema = z.object({
  pillId: z.string().min(1),
})

const runIdSchema = z.object({
  runId: z.string().min(1),
})

const deletePillSchema = z.object({
  pillId: z.string().min(1),
})

const startPillSchema = z.object({
  pillId: z.string().min(1),
  commandName: z.string().min(1),
  expiresAt: z.string().optional(),
  rotatePorts: z.boolean().optional(),
  useCapsule: z.boolean().optional(),
  capsuleId: z.string().optional(),
  deployTarget: z.enum(["production", "preview"]).optional(),
})

const stopPillSchema = z.object({
  pillId: z.string().min(1),
  runId: z.string().optional(),
})

export const listPillsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(() => getPills())

export const getPillStatusFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((data: unknown) => pillIdSchema.parse(data))
  .handler(({ data }) => getPillStatus(data))

export const getPillDiagnosticsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((data: unknown) => pillIdSchema.parse(data))
  .handler(({ data }) => getPillDiagnostics(data.pillId))

export const getRunLogsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((data: unknown) => runIdSchema.parse(data))
  .handler(({ data }) => getRunLogs(data.runId))

export const clearPillDiagnosticsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => pillIdSchema.parse(data))
  .handler(({ data }) => clearPillDiagnostics(data.pillId))

export const createPillFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => createPillSchema.parse(data))
  .handler(({ data }) => createPill(data))

export const updatePillFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => updatePillSchema.parse(data))
  .handler(({ data }) => updatePill(data))

export const deletePillFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => deletePillSchema.parse(data))
  .handler(({ data }) => deletePill(data))

export const startPillFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => startPillSchema.parse(data))
  .handler(({ data }) => startPillRuntime(data))

export const stopPillFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => stopPillSchema.parse(data))
  .handler(({ data }) => stopPillRun(data))
