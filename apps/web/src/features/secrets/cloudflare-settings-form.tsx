"use client"

import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { LockIcon, LockOpenIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { List, Mono, Notice, Row, Section } from "@/components/layout"
import { StatusText } from "@/components/status"
import { Input } from "@/components/ui/input"
import type { CloudflareConfig } from "@/features/pills/types"
import { CloudflareSetupGuide } from "@/features/secrets/cloudflare-setup-guide"
import { useCloudflareVault } from "@/features/secrets/cloudflare-vault-provider"
import { GatedButton } from "@/features/auth/gated-button"
import { useHasScopes } from "@/features/auth/use-scopes"
import type { getCloudflareVaultStatusFn } from "@/features/secrets/secret.functions"
import {
  deleteCloudflareVaultFn,
  saveCloudflareVaultFn,
} from "@/features/secrets/secret.functions"

type VaultStatus = Awaited<ReturnType<typeof getCloudflareVaultStatusFn>>

export function CloudflareSettingsForm({ status }: { status: VaultStatus }) {
  return status.hasVault ? <VaultManager /> : <VaultSetup />
}

function VaultManager() {
  const router = useRouter()
  const { isUnlocked, rootDomain, lock, requestUnlock, refreshVault } =
    useCloudflareVault()
  const deleteVault = useServerFn(deleteCloudflareVaultFn)
  const canUnlock = useHasScopes("vault:unlock")
  const canDelete = useHasScopes("vault:delete")
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [locking, setLocking] = useState(false)

  return (
    <>
      <Section title="Vault">
        <List>
          <Row
            title="Vault"
            detail="Your Cloudflare config is stored locally as ciphertext."
            trailing={<StatusText tone="success" label="Saved" />}
          />
          <Row
            title="Session"
            detail="Unlock the vault to start tunnels."
            trailing={
              <StatusText
                tone={isUnlocked ? "success" : "idle"}
                label={isUnlocked ? "Unlocked" : "Locked"}
              />
            }
          />
          {rootDomain && (
            <Row
              title="Root domain"
              trailing={<Mono className="text-foreground">{rootDomain}</Mono>}
            />
          )}
        </List>
      </Section>

      <Section title="Manage">
        <List>
          <Row
            title={isUnlocked ? "Lock session" : "Unlock vault"}
            detail="The passphrase decrypts the config into control plane memory only."
            trailing={
              !canUnlock ? (
                <GatedButton
                  scopes={["vault:unlock"]}
                  variant="secondary"
                  size="sm"
                >
                  <LockOpenIcon data-icon="inline-start" />
                  {isUnlocked ? "Lock session" : "Unlock vault"}
                </GatedButton>
              ) : isUnlocked ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={locking}
                  onClick={async () => {
                    setLocking(true)
                    try {
                      await lock()
                    } finally {
                      setLocking(false)
                    }
                  }}
                >
                  <LockIcon data-icon="inline-start" />
                  Lock session
                </Button>
              ) : (
                <Button size="sm" onClick={() => requestUnlock()}>
                  <LockOpenIcon data-icon="inline-start" />
                  Unlock vault
                </Button>
              )
            }
          />
          <Row
            title="Delete vault"
            detail="Removes the encrypted config from local storage and locks the session."
            trailing={
              !canDelete ? (
                <GatedButton
                  scopes={["vault:delete"]}
                  variant="secondary"
                  size="sm"
                >
                  <Trash2Icon data-icon="inline-start" />
                  Delete vault
                </GatedButton>
              ) : (
                <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <AlertDialogTrigger
                    render={<Button variant="secondary" size="sm" />}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    Delete vault
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete Cloudflare vault?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes the encrypted config from local storage and
                        locks the current session. You can save a new vault
                        afterwards.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleting}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        disabled={deleting}
                        onClick={async () => {
                          setDeleting(true)
                          try {
                            await deleteVault()
                            await refreshVault()
                            toast.success("Cloudflare vault deleted.")
                            setDeleteOpen(false)
                            await router.invalidate()
                          } catch (err) {
                            toast.error(
                              err instanceof Error
                                ? err.message
                                : "Failed to delete vault."
                            )
                          } finally {
                            setDeleting(false)
                          }
                        }}
                      >
                        Delete vault
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )
            }
          />
        </List>
      </Section>
    </>
  )
}

function VaultSetup() {
  const router = useRouter()
  const { refreshVault } = useCloudflareVault()
  const saveVault = useServerFn(saveCloudflareVaultFn)
  const canSave = useHasScopes("vault:write")
  const [pending, setPending] = useState(false)

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)

    const form = new FormData(event.currentTarget)
    const passphrase = String(form.get("passphrase") ?? "")
    const cloudflareConfig: CloudflareConfig = {
      accountId: String(form.get("accountId") ?? ""),
      zoneId: String(form.get("zoneId") ?? ""),
      rootDomain: String(form.get("rootDomain") ?? "").replace(
        /^https?:\/\//,
        ""
      ),
      apiToken: String(form.get("apiToken") ?? ""),
    }

    try {
      await saveVault({
        data: {
          config: cloudflareConfig,
          passphrase,
        },
      })
      await refreshVault()
      toast.success(
        "Cloudflare vault saved and unlocked for this Upster session."
      )
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save vault.")
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <CloudflareSetupGuide />
      <form className="flex flex-col gap-10" onSubmit={handleSave}>
        <Section
          title="Save vault"
          description="Paste your Cloudflare details to create an encrypted local vault."
        >
          <List>
            <Row
              title="Account ID"
              trailing={
                <Input
                  name="accountId"
                  aria-label="Account ID"
                  className="w-64"
                  required
                />
              }
            />
            <Row
              title="Zone ID"
              trailing={
                <Input
                  name="zoneId"
                  aria-label="Zone ID"
                  className="w-64"
                  required
                />
              }
            />
            <Row
              title="Root domain"
              trailing={
                <Input
                  name="rootDomain"
                  aria-label="Root domain"
                  placeholder="example.com"
                  className="w-64"
                  required
                />
              }
            />
            <Row
              title="API token"
              detail="Needs tunnel and DNS permissions for the selected zone."
              trailing={
                <Input
                  name="apiToken"
                  aria-label="API token"
                  type="password"
                  className="w-64"
                  required
                />
              }
            />
            <Row
              title="Vault passphrase"
              detail="At least 12 characters. Decrypts the vault in control plane memory only during explicit runtime actions."
              trailing={
                <Input
                  name="passphrase"
                  aria-label="Vault passphrase"
                  type="password"
                  minLength={12}
                  className="w-64"
                  required
                />
              }
            />
          </List>
        </Section>

        <Notice title="Stored encrypted">
          The token is validated, encrypted with your passphrase, and stored
          only as ciphertext. It is never logged.
        </Notice>

        <div>
          <GatedButton
            scopes={["vault:write"]}
            type="submit"
            disabled={pending || !canSave}
          >
            {pending ? "Saving..." : "Validate and save vault"}
          </GatedButton>
        </div>
      </form>
    </>
  )
}
