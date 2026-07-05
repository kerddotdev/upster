import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { requireScopes } from "@/features/auth/scope-middleware"

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
  .middleware([requireScopes("capsules:read")])
  .validator((data: unknown) => capsuleInfoSchema.parse(data))
  .handler(async ({ data }) => {
    const { getCapsuleInfo } =
      await import("@/features/capsules/capsule.server")

    return getCapsuleInfo(data.pillId)
  })

export const buildCapsuleFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("capsules:write")])
  .validator((data: unknown) => buildCapsuleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { buildCapsule } = await import("@/features/capsules/capsule.server")

    return buildCapsule(data, {
      sessionId: context.session.sid,
      kind: context.session.kind,
    })
  })

export const deleteCapsuleFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("capsules:delete")])
  .validator((data: unknown) => capsuleIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { deleteCapsuleVersion } =
      await import("@/features/capsules/capsule.server")

    return deleteCapsuleVersion(data.capsuleId, {
      sessionId: context.session.sid,
      kind: context.session.kind,
    })
  })

const relabelCapsuleSchema = z.object({
  capsuleId: z.string().min(1),
  label: z.string().nullable(),
})

export const relabelCapsuleFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("capsules:write")])
  .validator((data: unknown) => relabelCapsuleSchema.parse(data))
  .handler(async ({ data }) => {
    const { relabelCapsule } =
      await import("@/features/capsules/capsule.server")

    return relabelCapsule(data.capsuleId, data.label)
  })

const pinCapsuleSchema = z.object({
  capsuleId: z.string().min(1),
  pinned: z.boolean(),
})

export const pinCapsuleFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("capsules:write")])
  .validator((data: unknown) => pinCapsuleSchema.parse(data))
  .handler(async ({ data }) => {
    const { setCapsulePinned } =
      await import("@/features/capsules/capsule.server")

    return setCapsulePinned(data.capsuleId, data.pinned)
  })

const prunePillSchema = z.object({
  pillId: z.string().min(1),
  keep: z.number().int().min(0).optional(),
})

export const prunePillCapsulesFn = createServerFn({ method: "POST" })
  .middleware([requireScopes("capsules:delete")])
  .validator((data: unknown) => prunePillSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { runPrune } = await import("@/features/capsules/capsule.server")

    return runPrune(
      data.pillId,
      { sessionId: context.session.sid, kind: context.session.kind },
      data.keep
    )
  })

const capsuleDirSchema = z.object({
  capsuleId: z.string().min(1),
  path: z.string().optional(),
})

export const capsuleDirFn = createServerFn({ method: "GET" })
  .middleware([requireScopes("capsules:read")])
  .validator((data: unknown) => capsuleDirSchema.parse(data))
  .handler(async ({ data }) => {
    const { listCapsuleDir } =
      await import("@/features/capsules/capsule-files.server")

    return listCapsuleDir(data.capsuleId, data.path ?? "")
  })

const capsuleFileSchema = z.object({
  capsuleId: z.string().min(1),
  path: z.string().min(1),
})

export const capsuleFileFn = createServerFn({ method: "GET" })
  .middleware([requireScopes("capsules:read")])
  .validator((data: unknown) => capsuleFileSchema.parse(data))
  .handler(async ({ data }) => {
    const { readCapsuleFile } =
      await import("@/features/capsules/capsule-files.server")

    return readCapsuleFile(data.capsuleId, data.path)
  })
