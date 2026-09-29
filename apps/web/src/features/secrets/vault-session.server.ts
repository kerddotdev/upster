import {
  deleteSecretVault,
  getSecretVault,
  saveSecretVault,
  type AccessSessionKind,
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

const SHARED_VAULT_KEY = "shared"

export type VaultActor = {
  sessionId: string
  kind: AccessSessionKind
}

type CloudflareVaultSession = {
  config: CloudflareConfig
  unlockedAt: string
  expiresAt: string
  lastUsedAt: string
}

const cloudflareSessions = new Map<string, CloudflareVaultSession>()

function vaultKey(actor: VaultActor) {
  return actor.kind === "connection"
    ? `connection:${actor.sessionId}`
    : SHARED_VAULT_KEY
}

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

function currentSession(actor: VaultActor) {
  const key = vaultKey(actor)
  const session = cloudflareSessions.get(key)
  if (!session) {
    return null
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    cloudflareSessions.delete(key)
    return null
  }

  return session
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

export async function getVaultStatus(actor: VaultActor) {
  const vault = await getSecretVault("cloudflare")
  const session = currentSession(actor)
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
  actor: VaultActor
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

  unlockInMemory(input.actor, config, DEFAULT_VAULT_TTL_SECONDS)
  return getVaultStatus(input.actor)
}

export async function unlockCloudflareVault(input: {
  passphrase: string
  ttlSeconds?: number
  actor: VaultActor
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
    input.actor,
    config,
    Math.min(
      input.ttlSeconds ?? DEFAULT_VAULT_TTL_SECONDS,
      MAX_VAULT_TTL_SECONDS
    )
  )

  return getVaultStatus(input.actor)
}

export async function lockCloudflareVault(actor?: VaultActor) {
  if (actor) {
    cloudflareSessions.delete(vaultKey(actor))
  } else {
    cloudflareSessions.clear()
  }
  publishEvent({ domain: "vault", type: "locked" })
}

export async function deleteCloudflareVaultInteractive(actor: VaultActor) {
  cloudflareSessions.clear()
  await deleteSecretVault("cloudflare")
  publishEvent({ domain: "vault", type: "deleted" })
  return getVaultStatus(actor)
}

export async function getUnlockedCloudflareConfig(actor: VaultActor) {
  const session = currentSession(actor)
  if (!session) {
    return null
  }

  session.lastUsedAt = now()
  return session.config
}

export async function requireUnlockedCloudflareConfig(actor: VaultActor) {
  const status = await getVaultStatus(actor)
  if (!status.hasVault) {
    throw vaultMissingError()
  }

  const config = await getUnlockedCloudflareConfig(actor)
  if (!config) {
    throw vaultLockedError()
  }

  return config
}

function unlockInMemory(
  actor: VaultActor,
  config: CloudflareConfig,
  ttlSeconds: number
) {
  const unlockedAt = now()
  cloudflareSessions.set(vaultKey(actor), {
    config,
    unlockedAt,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    lastUsedAt: unlockedAt,
  })
  publishEvent({ domain: "vault", type: "unlocked" })
}
