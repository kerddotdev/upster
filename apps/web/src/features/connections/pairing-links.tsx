import { useState, type FormEvent, type ReactElement } from "react"
import { useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { ChevronDownIcon, CopyIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { connectionScopePresets, type AccessScope } from "@upster/core"

import {
  EmptyState,
  List,
  Mono,
  Notice,
  Row,
  Section,
} from "@/components/layout"
import { QrCode } from "@/components/qr-code"
import { StatusDot } from "@/components/status"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { GatedButton } from "@/features/auth/gated-button"
import { useHasScopes, useScopes } from "@/features/auth/use-scopes"
import {
  buildPairingUrl,
  copyText,
  formatCountdown,
  formatDateTime,
  useNow,
  type EndpointRow,
  type PairingLinkRow,
} from "@/features/connections/connections-shared"
import {
  ScopeBadge,
  ScopePicker,
  type ScopePreset,
} from "@/features/connections/scope-picker"
import {
  createPairingLinkFn,
  revokePairingLinkFn,
} from "@/features/connections/connection.functions"
import { cn } from "@/lib/utils"

function CopyPairingMenu({
  token,
  endpoints,
  trigger,
}: {
  token: string
  endpoints: Array<EndpointRow>
  trigger: ReactElement
}) {
  const options = endpoints
    .filter((endpoint) => endpoint.origin)
    .map((endpoint) => ({
      id: endpoint.id,
      label: endpoint.label,
      url: buildPairingUrl(endpoint.origin as string, token),
    }))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="end" className="w-auto min-w-56">
        {options.length ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Copy pairing URL</DropdownMenuLabel>
              {options.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  onClick={() =>
                    void copyText(option.url, `${option.label} URL copied.`)
                  }
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          onClick={() => void copyText(token, "Pairing code copied.")}
        >
          Copy code only
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EndpointHints({ endpoint }: { endpoint: EndpointRow }) {
  const hints = [
    endpoint.current ? "You are connected via this origin." : null,
    endpoint.setupRequired
      ? "Enable remote access above to use this endpoint."
      : null,
  ].filter(Boolean)

  if (!hints.length) {
    return null
  }

  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {hints.map((hint) => (
        <span key={hint}>{hint}</span>
      ))}
    </div>
  )
}

function EndpointSegmented({
  endpoints,
  value,
  onChange,
}: {
  endpoints: Array<EndpointRow>
  value: string
  onChange: (id: string) => void
}) {
  if (endpoints.length < 2) {
    return null
  }

  return (
    <div className="flex w-full gap-1 rounded-full bg-muted p-1">
      {endpoints.map((endpoint) => (
        <button
          key={endpoint.id}
          type="button"
          aria-pressed={endpoint.id === value}
          onClick={() => onChange(endpoint.id)}
          className={cn(
            "min-w-0 flex-1 truncate rounded-full px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            endpoint.id === value
              ? "bg-card text-foreground ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {endpoint.label}
        </button>
      ))}
    </div>
  )
}

function CreatePairingLinkDialog({
  endpoints,
  onCreated,
}: {
  endpoints: Array<EndpointRow>
  onCreated: (linkId: string, token: string) => void
}) {
  const router = useRouter()
  const callerScopes = useScopes()
  const canManage = useHasScopes("connections:manage")
  const createPairingLink = useServerFn(createPairingLinkFn)
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [preset, setPreset] = useState<ScopePreset>("viewer")
  const [customScopes, setCustomScopes] = useState<Array<AccessScope>>(
    connectionScopePresets.viewer
  )
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<{
    token: string
    link: PairingLinkRow
  } | null>(null)
  const [selectedEndpointId, setSelectedEndpointId] = useState(
    endpoints[0]?.id ?? ""
  )

  const selectedEndpoint =
    endpoints.find((endpoint) => endpoint.id === selectedEndpointId) ??
    endpoints[0] ??
    null

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
    setCustomScopes((current) =>
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : [...current, scope]
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedLabel = label.trim()
    if (!trimmedLabel || effectiveScopes.length === 0) {
      return
    }

    setPending(true)
    try {
      const result = await createPairingLink({
        data: {
          label: trimmedLabel,
          scopes: effectiveScopes,
        },
      })
      setCreated(result)
      setSelectedEndpointId(endpoints[0]?.id ?? "")
      onCreated(result.link.id, result.token)
      toast.success("Pairing link created.")
      await router.invalidate()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create pairing link."
      )
    } finally {
      setPending(false)
    }
  }

  function reset() {
    setLabel("")
    setPreset("viewer")
    setCustomScopes(connectionScopePresets.viewer)
    setCreated(null)
    setSelectedEndpointId(endpoints[0]?.id ?? "")
    setPending(false)
  }

  const url =
    created && selectedEndpoint?.origin
      ? buildPairingUrl(selectedEndpoint.origin, created.token)
      : null

  if (!canManage) {
    return (
      <GatedButton scopes={["connections:manage"]}>
        <PlusIcon data-icon="inline-start" />
        New pairing link
      </GatedButton>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          reset()
        }
      }}
    >
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        New pairing link
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Pairing link ready</DialogTitle>
              <DialogDescription>
                Scan or copy it now - it is shown once and expires in 5 minutes.
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-w-0 flex-col gap-4">
              <EndpointSegmented
                endpoints={endpoints}
                value={selectedEndpoint?.id ?? ""}
                onChange={setSelectedEndpointId}
              />

              {url ? (
                <>
                  <div className="flex flex-col items-center gap-3">
                    <QrCode value={url} className="w-44" />
                    <p className="text-center text-xs text-muted-foreground">
                      Scan from the device you want to pair.
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Pairing URL
                    </span>
                    <div className="overflow-x-auto rounded-xl bg-muted px-3 py-2.5">
                      <Mono className="break-normal whitespace-nowrap">
                        {url}
                      </Mono>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="flex-1"
                        onClick={() =>
                          void copyText(url, "Pairing URL copied.")
                        }
                      >
                        <CopyIcon data-icon="inline-start" />
                        Copy pairing URL
                      </Button>
                      <CopyPairingMenu
                        token={created.token}
                        endpoints={endpoints}
                        trigger={
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="More copy options"
                          >
                            <ChevronDownIcon />
                          </Button>
                        }
                      />
                    </div>
                  </div>
                  {selectedEndpoint ? (
                    <EndpointHints endpoint={selectedEndpoint} />
                  ) : null}
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <Notice tone="attention" title="Remote Access not enabled">
                    Enable remote access above to pair over Tailscale, or copy
                    the pairing code below to enter it manually.
                  </Notice>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void copyText(created.token, "Pairing code copied.")
                    }
                  >
                    <CopyIcon data-icon="inline-start" />
                    Copy code only
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Done
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New pairing link</DialogTitle>
              <DialogDescription>
                Name the browser you want to pair. The link is shown once and
                expires after 5 minutes.
              </DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <Field>
                <FieldLabel htmlFor="connectionLabel">Label</FieldLabel>
                <Input
                  id="connectionLabel"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={64}
                  autoFocus
                  required
                  placeholder="Work laptop"
                />
              </Field>

              <ScopePicker
                preset={preset}
                customScopes={customScopes}
                canGrant={canGrant}
                onPresetChange={handlePresetChange}
                onToggleScope={toggleCustomScope}
              />

              <DialogFooter>
                <DialogClose
                  render={<Button variant="outline" type="button" />}
                >
                  Cancel
                </DialogClose>
                <Button
                  type="submit"
                  disabled={
                    pending || !label.trim() || effectiveScopes.length === 0
                  }
                >
                  {pending ? "Creating..." : "Create pairing link"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RevokePairingLinkButton({
  link,
  pending,
  onRevoke,
}: {
  link: PairingLinkRow
  pending: boolean
  onRevoke: (linkId: string) => Promise<void>
}) {
  const canManage = useHasScopes("connections:manage")

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
          <AlertDialogTitle>Revoke pairing link?</AlertDialogTitle>
          <AlertDialogDescription>
            {link.label} will no longer be usable for pairing a browser.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => void onRevoke(link.id)}
          >
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function PairingLinkItem({
  link,
  endpoints,
  token,
  now,
  pending,
  onRevoke,
}: {
  link: PairingLinkRow
  endpoints: Array<EndpointRow>
  token: string | undefined
  now: number
  pending: boolean
  onRevoke: (linkId: string) => Promise<void>
}) {
  const countdown = formatCountdown(link.expiresAt, now)
  const expiryLabel =
    countdown === "Expired" ? "Expired" : `Expires in ${countdown}`

  return (
    <Row
      leading={<StatusDot tone="attention" />}
      title={
        <span title={`Created ${formatDateTime(link.createdAt)}`}>
          {link.label}
        </span>
      }
      detail={expiryLabel}
      trailing={
        <>
          <ScopeBadge scopes={link.scopes} />
          {token ? (
            <CopyPairingMenu
              token={token}
              endpoints={endpoints}
              trigger={
                <Button variant="outline" size="sm">
                  <CopyIcon data-icon="inline-start" />
                  Copy
                  <ChevronDownIcon data-icon="inline-end" />
                </Button>
              }
            />
          ) : null}
          <RevokePairingLinkButton
            link={link}
            pending={pending}
            onRevoke={onRevoke}
          />
        </>
      }
    />
  )
}

export function PairingLinks({
  endpoints,
  links,
}: {
  endpoints: Array<EndpointRow>
  links: Array<PairingLinkRow>
}) {
  const router = useRouter()
  const revokePairingLink = useServerFn(revokePairingLinkFn)
  const now = useNow()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [tokens, setTokens] = useState<Record<string, string>>({})

  function rememberToken(linkId: string, token: string) {
    setTokens((current) => ({ ...current, [linkId]: token }))
  }

  async function handleRevoke(linkId: string) {
    setPendingId(linkId)
    try {
      await revokePairingLink({ data: { linkId } })
      setTokens((current) => {
        const next = { ...current }
        delete next[linkId]
        return next
      })
      toast.success("Pairing link revoked.")
      await router.invalidate()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke pairing link."
      )
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Section
      title="Pairing links"
      description="Create a short-lived link for the browser you want to pair."
      actions={
        <CreatePairingLinkDialog
          endpoints={endpoints}
          onCreated={rememberToken}
        />
      }
    >
      {links.length ? (
        <List>
          {links.map((link) => (
            <PairingLinkItem
              key={link.id}
              link={link}
              endpoints={endpoints}
              token={tokens[link.id]}
              now={now}
              pending={pendingId === link.id}
              onRevoke={handleRevoke}
            />
          ))}
        </List>
      ) : (
        <EmptyState>
          No active pairing links. New links you create show up here until they
          are used or expire.
        </EmptyState>
      )}
    </Section>
  )
}
