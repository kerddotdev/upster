import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { authMiddleware } from "@/features/auth/auth-middleware"
import {
  buildCapsule,
  deleteCapsuleVersion,
  getCapsuleInfo,
} from "@/features/capsules/capsule.server"

const capsuleInfoSchema = z.object({
  pillId: z.string().min(1),
})

const buildCapsuleSchema = z.object({
  pillId: z.string().min(1),
  includeNodeModules: z.boolean(),
  installDeps: z.boolean(),
  label: z.string().optional(),
})

const capsuleIdSchema = z.object({
  capsuleId: z.string().min(1),
})

export const getCapsuleInfoFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((data: unknown) => capsuleInfoSchema.parse(data))
  .handler(({ data }) => getCapsuleInfo(data.pillId))

export const buildCapsuleFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => buildCapsuleSchema.parse(data))
  .handler(({ data }) => buildCapsule(data))

export const deleteCapsuleFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => capsuleIdSchema.parse(data))
  .handler(({ data }) => deleteCapsuleVersion(data.capsuleId))
