"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Link } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  getCloudflareVaultStatusFn,
  lockCloudflareVaultFn,
  unlockCloudflareVaultFn,
} from "@/features/secrets/secret.functions"

type VaultStatus = Awaited<ReturnType<typeof getCloudflareVaultStatusFn>>

type UnlockRequest = {
  onUnlocked?: () => void
} | null

type CloudflareVaultContextValue = {
  status: VaultStatus | null
  isUnlocked: boolean
  hasVault: boolean
  rootDomain: string | null
  lock: () => Promise<void>
  refreshVault: () => Promise<void>
  requestUnlock: (options?: { onUnlocked?: () => void }) => void
}

const CloudflareVaultContext =
  createContext<CloudflareVaultContextValue | null>(null)

const UnlockRequestContext = createContext<{
  request: UnlockRequest
  close: () => void
} | null>(null)

export function CloudflareVaultProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const getStatus = useServerFn(getCloudflareVaultStatusFn)
  const lockVault = useServerFn(lockCloudflareVaultFn)
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [request, setRequest] = useState<UnlockRequest>(null)

  const refreshVault = useCallback(async () => {
    setStatus(await getStatus())
  }, [getStatus])

  useEffect(() => {
    void refreshVault()
  }, [refreshVault])

  const value = useMemo<CloudflareVaultContextValue>(
    () => ({
      status,
      isUnlocked: Boolean(status?.isUnlocked),
      hasVault: Boolean(status?.hasVault),
      rootDomain: status?.rootDomain ?? null,
      lock: async () => {
        setStatus(await lockVault())
      },
      refreshVault,
      requestUnlock: (options) => {
        setRequest(options ?? {})
        void refreshVault()
      },
    }),
    [lockVault, refreshVault, status]
  )

  const requestValue = useMemo(
    () => ({ request, close: () => setRequest(null) }),
    [request]
  )

  return (
    <CloudflareVaultContext.Provider value={value}>
      <UnlockRequestContext.Provider value={requestValue}>
        {children}
        <CloudflareUnlockDialog />
      </UnlockRequestContext.Provider>
    </CloudflareVaultContext.Provider>
  )
}

export function useCloudflareVault() {
  const context = useContext(CloudflareVaultContext)

  if (!context) {
    throw new Error(
      "useCloudflareVault must be used inside CloudflareVaultProvider."
    )
  }

  return context
}

function CloudflareUnlockDialog() {
  const requestContext = useContext(UnlockRequestContext)
  const { hasVault, status, refreshVault } = useCloudflareVault()
  const unlockVault = useServerFn(unlockCloudflareVaultFn)
  const [pending, setPending] = useState(false)

  if (!requestContext) {
    return null
  }

  const { request, close } = requestContext
  const open = request !== null

  async function handleUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!hasVault) {
      toast.error("No Cloudflare Vault has been saved yet.")
      return
    }

    setPending(true)
    const form = new FormData(event.currentTarget)
    const passphrase = String(form.get("passphrase") ?? "")
    const onUnlocked = request?.onUnlocked

    try {
      await unlockVault({ data: { passphrase } })
      await refreshVault()
      toast.success("Cloudflare Vault unlocked for this Upster session.")
      close()
      onUnlocked?.()
    } catch {
      toast.error("Could not unlock the Vault with that passphrase.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unlock Cloudflare Vault</DialogTitle>
          <DialogDescription>
            The passphrase decrypts your config into control plane memory for
            this Upster session only.
          </DialogDescription>
        </DialogHeader>
        {status === null ? (
          <p className="text-muted-foreground">Checking the Vault...</p>
        ) : hasVault ? (
          <form className="flex flex-col gap-4" onSubmit={handleUnlock}>
            <Field>
              <FieldLabel htmlFor="globalUnlockPassphrase">
                Passphrase
              </FieldLabel>
              <Input
                id="globalUnlockPassphrase"
                name="passphrase"
                type="password"
                autoFocus
                required
              />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Unlocking..." : "Unlock"}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground">
              Save a Cloudflare Vault before unlocking it.
            </p>
            <Button render={<Link to="/settings/cloudflare" />} onClick={close}>
              Go to Cloudflare settings
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
