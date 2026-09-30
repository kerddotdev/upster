import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { PencilIcon, ShieldIcon } from "lucide-react"
import { toast } from "sonner"
import { connectionScopePresets, type AccessScope } from "@upster/core"

import { EmptyState, List, Notice, Row, Section } from "@/components/layout"
import { StatusBadge, StatusDot } from "@/components/status"
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { GatedButton } from "@/features/auth/gated-button"
import { useHasScopes, useScopes } from "@/features/auth/use-scopes"
import {
  deviceSummary,
  type ConnectionRow,
} from "@/features/connections/connections-shared"
import {
  renameConnectionFn,
  revokeConnectionFn,
  updateConnectionScopesFn,
} from "@/features/connections/connection.functions"
import { matchPreset } from "@/features/connections/scope-presets"
import {
  ScopeBadge,
  ScopePicker,
  type ScopePreset,
} from "@/features/connections/scope-picker"

function RenameConnectionDialog({
  connection,
  onRename,
}: {
  connection: ConnectionRow
  onRename: (sessionId: string, label: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(connection.label)
  const [pending, setPending] = useState(false)
  const canManage = useHasScopes("connections:manage")

  useEffect(() => {
    if (!open) {
      setValue(connection.label)
    }
  }, [connection.label, open])

  if (!canManage) {
    return null
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || trimmed === connection.label) {
      setOpen(false)
      return
    }

    setPending(true)
    try {
      await onRename(connection.id, trimmed)
      setOpen(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to rename connection."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <PencilIcon />
        <span className="sr-only">Rename connection</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename connection</DialogTitle>
          <DialogDescription>
            Update the label shown for this browser.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="renameLabel">Label</FieldLabel>
            <Input
              id="renameLabel"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={64}
              autoFocus
              required
            />
          </Field>
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" type="button" disabled={pending} />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending || !value.trim()}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditConnectionScopesDialog({
  connection,
}: {
  connection: ConnectionRow
}) {
  const router = useRouter()
  const callerScopes = useScopes()
  const canManage = useHasScopes("connections:manage")
  const updateScopes = useServerFn(updateConnectionScopesFn)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  const current = connection.scopes as Array<AccessScope>
  const [preset, setPreset] = useState<ScopePreset>(
    () => matchPreset(current) ?? "custom"
  )
  const [customScopes, setCustomScopes] = useState<Array<AccessScope>>(current)

  useEffect(() => {
    if (!open) {
      setPreset(matchPreset(current) ?? "custom")
      setCustomScopes(current)
    }
  }, [connection.id, open])

  if (!canManage) {
    return null
  }

  const effectiveScopes: Array<AccessScope> =
    preset === "custom" ? customScopes : connectionScopePresets[preset]

  function canGrant(scope: AccessScope) {
    return callerScopes === null || callerScopes.includes(scope)
  }

  function handlePresetChange(next: ScopePreset) {
    if (next === "custom") {
      setCustomScopes(effectiveScopes)
    }
    setPreset(next)
  }

  function toggleCustomScope(scope: AccessScope) {
    setCustomScopes((entries) =>
      entries.includes(scope)
        ? entries.filter((entry) => entry !== scope)
        : [...entries, scope]
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (effectiveScopes.length === 0) {
      return
    }

    setPending(true)
    try {
      await updateScopes({
        data: { sessionId: connection.id, scopes: effectiveScopes },
      })
      toast.success("Connection permissions updated.")
      setOpen(false)
      await router.invalidate()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update permissions."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <ShieldIcon />
        <span className="sr-only">Edit permissions</span>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit permissions</DialogTitle>
          <DialogDescription>
            Narrowing scopes takes effect immediately on the next request. You
            can only grant scopes you hold yourself.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          {connection.isCurrent ? (
            <Notice tone="attention" title="This is your current connection">
              Removing your own permissions may lock you out of parts of the
              dashboard until you pair again.
            </Notice>
          ) : null}
          <ScopePicker
            preset={preset}
            customScopes={customScopes}
            canGrant={canGrant}
            onPresetChange={handlePresetChange}
            onToggleScope={toggleCustomScope}
          />
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" type="button" disabled={pending} />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={pending || effectiveScopes.length === 0}
            >
              {pending ? "Saving..." : "Save permissions"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RevokeConnectionButton({
  connection,
  pending,
  onRevoke,
}: {
  connection: ConnectionRow
  pending: boolean
  onRevoke: (sessionId: string) => Promise<void>
}) {
  const canManage = useHasScopes("connections:manage")

  if (connection.isCurrent) {
    return (
      <Button variant="ghost" size="sm" disabled title="Use logout instead">
        Revoke
      </Button>
    )
  }

  if (!canManage) {
    return (
      <GatedButton
        scopes={["connections:manage"]}
        variant="destructive"
        size="sm"
      >
        Revoke
      </GatedButton>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        Revoke
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke connection?</AlertDialogTitle>
          <AlertDialogDescription>
            {connection.label} will be signed out the next time it contacts
            Upster.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => void onRevoke(connection.id)}
          >
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ConnectionItem({
  connection,
  pending,
  onRename,
  onRevoke,
}: {
  connection: ConnectionRow
  pending: boolean
  onRename: (sessionId: string, label: string) => Promise<void>
  onRevoke: (sessionId: string) => Promise<void>
}) {
  return (
    <Row
      leading={
        <StatusDot tone={connection.connectedNow ? "success" : "idle"} />
      }
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{connection.label}</span>
          {connection.isCurrent ? (
            <StatusBadge tone="running" label="This device" />
          ) : null}
        </span>
      }
      detail={
        <span className="block truncate">{deviceSummary(connection)}</span>
      }
      trailing={
        <>
          <ScopeBadge scopes={connection.scopes} />
          <RenameConnectionDialog connection={connection} onRename={onRename} />
          <EditConnectionScopesDialog connection={connection} />
          <RevokeConnectionButton
            connection={connection}
            pending={pending}
            onRevoke={onRevoke}
          />
        </>
      }
    />
  )
}

export function PairedConnections({
  connections,
}: {
  connections: Array<ConnectionRow>
}) {
  const router = useRouter()
  const renameConnection = useServerFn(renameConnectionFn)
  const revokeConnection = useServerFn(revokeConnectionFn)
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function handleRename(sessionId: string, label: string) {
    await renameConnection({ data: { sessionId, label } })
    toast.success("Connection renamed.")
    await router.invalidate()
  }

  async function handleRevoke(sessionId: string) {
    setPendingId(sessionId)
    try {
      await revokeConnection({ data: { sessionId } })
      toast.success("Connection revoked.")
      await router.invalidate()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke connection."
      )
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Section
      title="Paired connections"
      description="Permanent browser credentials can be renamed or revoked here."
    >
      {connections.length ? (
        <List>
          {connections.map((connection) => (
            <ConnectionItem
              key={connection.id}
              connection={connection}
              pending={pendingId === connection.id}
              onRename={handleRename}
              onRevoke={handleRevoke}
            />
          ))}
        </List>
      ) : (
        <EmptyState>
          No paired connections yet. Pair a browser with a link above and it
          will appear here with permanent access.
        </EmptyState>
      )}
    </Section>
  )
}
