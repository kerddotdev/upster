import { z } from "zod"

import { accessScopes } from "./scopes"

export const accessScopeSchema = z.enum(accessScopes)

export const sessionKindSchema = z.enum(["dashboard", "cli", "agent"])

export const createAgentSessionSchema = z.object({
  label: z.string().min(1).max(120),
  scopes: z.array(accessScopeSchema).min(1),
  ttlSeconds: z
    .number()
    .int()
    .positive()
    .max(60 * 60 * 24 * 30),
})

export const cloudflareConfigSchema = z.object({
  accountId: z.string().min(1),
  zoneId: z.string().min(1),
  rootDomain: z.string().min(1),
  apiToken: z.string().min(1),
})

export const vaultSaveSchema = z.object({
  config: cloudflareConfigSchema,
  passphrase: z.string().min(12).max(1024),
})

export const vaultUnlockSchema = z.object({
  passphrase: z.string().min(1).max(1024),
  ttlSeconds: z
    .number()
    .int()
    .positive()
    .max(60 * 60 * 24)
    .optional(),
})

export const createPillSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  repoPath: z.string().min(1),
  defaultEnv: z.string().min(1),
  commandName: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().optional(),
  healthcheckPath: z.string().optional(),
})

export const updatePillSchema = z.object({
  name: z.string().min(1),
  defaultEnv: z.string().min(1),
  commandName: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  healthcheckPath: z.string().nullable().optional(),
})

export const startPillSchema = z.object({
  commandName: z.string().min(1).optional(),
  expiresAt: z.string().optional(),
  rotatePorts: z.boolean().optional(),
  useCapsule: z.boolean().optional(),
  capsuleId: z.string().optional(),
  deployTarget: z.enum(["production", "preview"]).optional(),
})

export const buildCapsuleSchema = z.object({
  includeNodeModules: z.boolean(),
  installDeps: z.boolean(),
  label: z.string().optional(),
})
