"use client"

import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import {
  LockIcon,
  LockOpenIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
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
  const hasVault = status.hasVault

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium">Cloudflare</h1>
        <p className="text-sm text-muted-foreground">
          Save an encrypted local vault and unlock it only in control plane
          memory.
        </p>
      </div>

      {hasVault ? <VaultManager /> : <VaultSetup />}
    </div>
  )
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "ok" | "muted"
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
        <span
          className={cn(
            "size-1.5 rounded-full",
            tone === "ok" ? "bg-emerald-500" : "bg-muted-foreground"
          )}
        />
        {value}
      </span>
    </div>
  )
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
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Vault</CardTitle>
        <CardDescription>
          Your Cloudflare config is stored locally as ciphertext. Unlock it to
          start tunnels.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusRow label="Vault" value="Saved" tone="ok" />
          <StatusRow
            label="Session"
            value={isUnlocked ? "Unlocked" : "Locked"}
            tone={isUnlocked ? "ok" : "muted"}
          />
        </div>

        {rootDomain && (
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-xs text-muted-foreground">Root domain</span>
            <span className="truncate font-mono text-xs font-medium">
              {rootDomain}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!canUnlock ? (
            <GatedButton scopes={["vault:unlock"]} variant="outline">
              <LockOpenIcon data-icon="inline-start" />
              {isUnlocked ? "Lock session" : "Unlock vault"}
            </GatedButton>
          ) : isUnlocked ? (
            <Button
              variant="outline"
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
            <Button onClick={() => requestUnlock()}>
              <LockOpenIcon data-icon="inline-start" />
              Unlock vault
            </Button>
          )}

          {!canDelete ? (
            <GatedButton scopes={["vault:delete"]} variant="outline">
              <Trash2Icon data-icon="inline-start" />
              Delete vault
            </GatedButton>
          ) : (
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogTrigger render={<Button variant="outline" />}>
                <Trash2Icon data-icon="inline-start" />
                Delete vault
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Cloudflare vault?</AlertDialogTitle>
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
          )}
        </div>
      </CardContent>
    </Card>
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
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <CloudflareSetupGuide />
      <Card>
        <CardHeader>
          <CardTitle>Save vault</CardTitle>
          <CardDescription>
            Paste your Cloudflare details to create an encrypted local vault.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSave}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="accountId">Account ID</FieldLabel>
                <Input id="accountId" name="accountId" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="zoneId">Zone ID</FieldLabel>
                <Input id="zoneId" name="zoneId" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="rootDomain">Root domain</FieldLabel>
                <Input
                  id="rootDomain"
                  name="rootDomain"
                  placeholder="example.com"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="apiToken">API token</FieldLabel>
                <Input id="apiToken" name="apiToken" type="password" required />
                <FieldDescription>
                  Needs tunnel and DNS permissions for the selected zone.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="passphrase">Vault passphrase</FieldLabel>
                <Input
                  id="passphrase"
                  name="passphrase"
                  type="password"
                  minLength={12}
                  required
                />
                <FieldDescription>
                  Use at least 12 characters. This decrypts the vault in control
                  plane memory only during explicit runtime actions.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <GatedButton
              scopes={["vault:write"]}
              type="submit"
              disabled={pending || !canSave}
            >
              {pending ? "Saving..." : "Validate and save vault"}
            </GatedButton>
          </form>

          <Alert className="mt-4">
            <ShieldCheckIcon />
            <AlertTitle>Stored encrypted</AlertTitle>
            <AlertDescription>
              The token is validated, encrypted with your passphrase, and stored
              only as ciphertext. It is never logged.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
