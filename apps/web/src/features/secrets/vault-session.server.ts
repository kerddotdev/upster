import {
  deleteSecretVault,
  getSecretVault,
  saveSecretVault,
} from "@/db/repositories.server"
import { publishEvent } from "@/features/events/event-bus.server"
import { CloudflareClient } from "@/features/cloudflare/client.server"
import type { CloudflareConfig } from "@/features/pills/types"
import {
  decryptCloudflareVault,
  encryptCloudflareVault,
  type EncryptedVaultInput,
} from "@/features/secrets/vault"
import { vaultLockedError, vaultMissingError } from "@upster/core"

const DEFAULT_VAULT_TTL_SECONDS = 60 * 60 * 8
const MAX_VAULT_TTL_SECONDS = 60 * 60 * 24

type CloudflareVaultSession = {
  config: CloudflareConfig
  unlockedBySessionId: string | null
  unlockedAt: string
  expiresAt: string
  lastUsedAt: string
}

let cloudflareSession: CloudflareVaultSession | null = null

function now() {
  return new Date().toISOString()
}

function toEncryptedVault(vault: Awaited<ReturnType<typeof getSecretVault>>) {
  if (!vault) {
    return null
  }

  return {
    name: "cloudflare",
    ciphertext: vault.ciphertext,
    salt: vault.salt,
    nonce: vault.nonce,
    kdf: "argon2id",
    version: 1,
  } satisfies EncryptedVaultInput
}

function parsePublicMetadata(
  vault: Awaited<ReturnType<typeof getSecretVault>>
) {
  if (!vault?.publicMetadataJson) {
    return {}
  }

  try {
    return JSON.parse(vault.publicMetadataJson) as { rootDomain?: string }
  } catch {
    return {}
  }
}

function normalizeConfig(config: CloudflareConfig): CloudflareConfig {
  return {
    accountId: config.accountId.trim(),
    zoneId: config.zoneId.trim(),
    rootDomain: config.rootDomain.trim().replace(/^https?:\/\//, ""),
    apiToken: config.apiToken,
  }
}

function currentSession() {
  if (!cloudflareSession) {
    return null
  }

  if (new Date(cloudflareSession.expiresAt).getTime() <= Date.now()) {
    cloudflareSession = null
    return null
  }

  return cloudflareSession
}

async function savePublicMetadata(config: CloudflareConfig) {
  const vault = await getSecretVault("cloudflare")
  if (!vault) {
    return
  }

  await saveSecretVault({
    name: "cloudflare",
    ciphertext: vault.ciphertext,
    salt: vault.salt,
    nonce: vault.nonce,
    kdf: vault.kdf,
    version: vault.version,
    publicMetadata: {
      rootDomain: config.rootDomain,
    },
  })
}

export async function getVaultStatus() {
  const vault = await getSecretVault("cloudflare")
  const session = currentSession()
  const metadata = parsePublicMetadata(vault)

  return {
    hasVault: Boolean(vault),
    isUnlocked: Boolean(session),
    rootDomain: session?.config.rootDomain ?? metadata.rootDomain ?? null,
    unlockedAt: session?.unlockedAt ?? null,
    expiresAt: session?.expiresAt ?? null,
    lastUsedAt: session?.lastUsedAt ?? null,
  }
}

export async function saveCloudflareVaultInteractive(input: {
  config: CloudflareConfig
  passphrase: string
  actorSessionId?: string | null
}) {
  const config = normalizeConfig(input.config)

  await new CloudflareClient(config).validateToken()
  const encrypted = await encryptCloudflareVault(config, input.passphrase)

  await saveSecretVault({
    ...encrypted,
    publicMetadata: {
      rootDomain: config.rootDomain,
    },
  })

  unlockInMemory(
    config,
    input.actorSessionId ?? null,
    DEFAULT_VAULT_TTL_SECONDS
  )
  return getVaultStatus()
}

export async function unlockCloudflareVault(input: {
  passphrase: string
  ttlSeconds?: number
  actorSessionId?: string | null
}) {
  const vault = await getSecretVault("cloudflare")
  const encryptedVault = toEncryptedVault(vault)

  if (!encryptedVault) {
    throw vaultMissingError()
  }

  const config = normalizeConfig(
    await decryptCloudflareVault(encryptedVault, input.passphrase)
  )

  await new CloudflareClient(config).validateToken()
  await savePublicMetadata(config)
  unlockInMemory(
    config,
    input.actorSessionId ?? null,
    Math.min(
      input.ttlSeconds ?? DEFAULT_VAULT_TTL_SECONDS,
      MAX_VAULT_TTL_SECONDS
    )
  )

  return getVaultStatus()
}

export async function lockCloudflareVault() {
  cloudflareSession = null
  publishEvent({ domain: "vault", type: "locked" })
  return getVaultStatus()
}

export async function deleteCloudflareVaultInteractive() {
  cloudflareSession = null
  await deleteSecretVault("cloudflare")
  publishEvent({ domain: "vault", type: "deleted" })
  return getVaultStatus()
}

export async function getUnlockedCloudflareConfig() {
  const session = currentSession()
  if (!session) {
    return null
  }

  session.lastUsedAt = now()
  return session.config
}

export async function requireUnlockedCloudflareConfig() {
  const status = await getVaultStatus()
  if (!status.hasVault) {
    throw vaultMissingError()
  }

  const config = await getUnlockedCloudflareConfig()
  if (!config) {
    throw vaultLockedError()
  }

  return config
}

function unlockInMemory(
  config: CloudflareConfig,
  actorSessionId: string | null,
  ttlSeconds: number
) {
  const unlockedAt = now()
  cloudflareSession = {
    config,
    unlockedBySessionId: actorSessionId,
    unlockedAt,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    lastUsedAt: unlockedAt,
  }
  publishEvent({ domain: "vault", type: "unlocked" })
}
