import {
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import {
  ChevronDownIcon,
  CopyIcon,
  InfoIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react"
import { toast } from "sonner"
import {
  connectionScopePresets,
  type AccessScope,
  type ConnectionScopePreset,
} from "@upster/core"

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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { QrCode } from "@/components/qr-code"
import { cn } from "@/lib/utils"
import { useIsRemoteEnvironment } from "@/lib/environment"
import {
  createPairingLinkFn,
  getConnectionEndpointsFn,
  listConnectionsFn,
  listPairingLinksFn,
  panicLockdownFn,
  renameConnectionFn,
  revokeConnectionFn,
  revokePairingLinkFn,
} from "@/features/connections/connection.functions"
import {
  disableTailscaleServeFn,
  enableTailscaleServeFn,
  getTailscaleStatusFn,
  startTailscaleLoginFn,
} from "@/features/tailscale/tailscale.functions"
import { AccessDenied } from "@/components/access-denied"
import { GatedButton } from "@/features/auth/gated-button"
import { useHasScopes, useScopes } from "@/features/auth/use-scopes"
import {
  describeScopes,
  presetMeta,
  scopeGroups,
} from "@/features/connections/scope-presets"

export const Route = createFileRoute("/connections")({
  loader: loadConnectionsPage,
  errorComponent: AccessDenied,
  component: ConnectionsPage,
})

async function loadConnectionsPage() {
  const [connections, pairingLinks, endpoints, tailscale] = await Promise.all([
    listConnectionsFn(),
    listPairingLinksFn(),
    getConnectionEndpointsFn(),
    getTailscaleStatusFn(),
  ])

  return { connections, pairingLinks, endpoints, tailscale }
}

type LoaderData = Awaited<ReturnType<typeof loadConnectionsPage>>
type ConnectionRow = LoaderData["connections"][number]
type PairingLinkRow = LoaderData["pairingLinks"][number]
type EndpointRow = LoaderData["endpoints"][number]
type TailscaleStatusRow = LoaderData["tailscale"]

function ConnectionsPage() {
  const { connections, pairingLinks, endpoints, tailscale } =
    Route.useLoaderData()
  const remote = useIsRemoteEnvironment()
  const router = useRouter()
  const revokePairingLink = useServerFn(revokePairingLinkFn)
  const renameConnection = useServerFn(renameConnectionFn)
  const revokeConnection = useServerFn(revokeConnectionFn)
  const now = useNow()
  const [pendingPairingLinkId, setPendingPairingLinkId] = useState<
    string | null
  >(null)
  const [pendingConnectionId, setPendingConnectionId] = useState<string | null>(
    null
  )
  const [createdTokens, setCreatedTokens] = useState<Record<string, string>>({})

  function rememberToken(linkId: string, token: string) {
    setCreatedTokens((current) => ({ ...current, [linkId]: token }))
  }

  async function handleRevokePairingLink(linkId: string) {
    setPendingPairingLinkId(linkId)
    try {
      await revokePairingLink({ data: { linkId } })
      setCreatedTokens((current) => {
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
      setPendingPairingLinkId(null)
    }
  }

  async function handleRenameConnection(sessionId: string, label: string) {
    await renameConnection({ data: { sessionId, label } })
    toast.success("Connection renamed.")
    await router.invalidate()
  }

  async function handleRevokeConnection(sessionId: string) {
    setPendingConnectionId(sessionId)
    try {
      await revokeConnection({ data: { sessionId } })
      toast.success("Connection revoked.")
      await router.invalidate()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke connection."
      )
    } finally {
      setPendingConnectionId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-medium">Remote access</h1>
        <p className="text-sm text-muted-foreground">
          Expose this dashboard over Tailscale and pair trusted browsers.
        </p>
      </div>

      <RemoteAccessCard status={tailscale} remote={remote} />

      <PairingCard
        endpoints={endpoints}
        links={pairingLinks}
        tokens={createdTokens}
        now={now}
        pendingId={pendingPairingLinkId}
        onCreated={rememberToken}
        onRevoke={handleRevokePairingLink}
      />

      <ConnectionsCard
        connections={connections}
        pendingId={pendingConnectionId}
        onRename={handleRenameConnection}
        onRevoke={handleRevokeConnection}
      />
    </div>
  )
}

function StatusDot({ className, ping }: { className: string; ping?: boolean }) {
  return (
    <span className="relative flex size-2.5 shrink-0 items-center justify-center">
      {ping ? (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            className
          )}
        />
      ) : null}
      <span
        className={cn("relative inline-flex size-2 rounded-full", className)}
      />
    </span>
  )
}

function ListRows({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/60 border-t border-border/60">
      {children}
    </div>
  )
}

function pairingUrlOptions(endpoints: Array<EndpointRow>, token: string) {
  return endpoints
    .filter((endpoint) => endpoint.origin)
    .map((endpoint) => ({
      id: endpoint.id,
      label: endpoint.label,
      url: buildPairingUrl(endpoint.origin as string, token),
    }))
}

function CopyPairingMenu({
  token,
  endpoints,
  trigger,
}: {
  token: string
  endpoints: Array<EndpointRow>
  trigger: ReactElement
}) {
  const options = pairingUrlOptions(endpoints, token)

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

function RemoteAccessBadge({ status }: { status: TailscaleStatusRow }) {
  if (!status.available) {
    return <Badge variant="outline">Unavailable</Badge>
  }
  if (status.funnelActive) {
    return <Badge variant="destructive">Funnel</Badge>
  }
  if (!status.loggedIn) {
    return <Badge variant="outline">Not connected</Badge>
  }
  if (status.serveHttpsActive) {
    return <Badge>On</Badge>
  }
  return <Badge variant="outline">Connected</Badge>
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium break-all">{value}</div>
    </div>
  )
}

function RemoteAccessDisableButton({
  remote,
  pending,
  onDisable,
}: {
  remote: boolean
  pending: boolean
  onDisable: () => void
}) {
  if (!remote) {
    return (
      <div>
        <Button variant="outline" disabled={pending} onClick={onDisable}>
          Disable remote access
        </Button>
      </div>
    )
  }

  return (
    <div>
      <AlertDialog>
        <AlertDialogTrigger
          render={<Button variant="outline" disabled={pending} />}
        >
          Disable remote access
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable remote access?</AlertDialogTitle>
            <AlertDialogDescription>
              You are connected through Tailscale right now. Turning off remote
              access ends this session immediately, and you will not be able to
              reconnect from here until you re-enable it directly on the host
              machine.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep it on</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={onDisable}
            >
              Disable anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RemoteAccessCard({
  status,
  remote,
}: {
  status: TailscaleStatusRow
  remote: boolean
}) {
  const router = useRouter()
  const startLogin = useServerFn(startTailscaleLoginFn)
  const enableServe = useServerFn(enableTailscaleServeFn)
  const disableServe = useServerFn(disableTailscaleServeFn)
  const panicLockdown = useServerFn(panicLockdownFn)
  const canManage = useHasScopes("connections:manage")
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function run(action: () => Promise<unknown>, success: string) {
    setPending(true)
    try {
      await action()
      toast.success(success)
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Tailscale
          <RemoteAccessBadge status={status} />
        </CardTitle>
        <CardDescription>
          {status.available
            ? "Reach this dashboard from other devices on your private tailnet."
            : "The Tailscale sidecar is not reachable. Start the stack with docker compose up."}
        </CardDescription>
      </CardHeader>
      {status.available ? (
        <CardContent className="flex flex-col gap-4">
          {status.funnelActive ? (
            <Alert variant="destructive">
              <AlertTitle>Funnel is exposing this dashboard</AlertTitle>
              <AlertDescription>
                Tailscale Funnel is publishing this node to the public internet.
                Upster never enables Funnel itself. Turn it off on the host with
                tailscale funnel off unless you intend the dashboard to be
                publicly reachable.
              </AlertDescription>
            </Alert>
          ) : null}
          {status.loggedIn ? (
            <>
              {status.magicDnsName ? (
                <Detail label="MagicDNS name" value={status.magicDnsName} />
              ) : null}
              {!canManage ? (
                <GatedButton scopes={["connections:manage"]} variant="outline">
                  {status.serveHttpsActive
                    ? "Disable remote access"
                    : "Enable remote access"}
                </GatedButton>
              ) : status.serveHttpsActive ? (
                <RemoteAccessDisableButton
                  remote={remote}
                  pending={pending}
                  onDisable={() =>
                    void run(() => disableServe(), "Remote access disabled.")
                  }
                />
              ) : (
                <div>
                  <Button
                    disabled={pending}
                    onClick={() =>
                      void run(() => enableServe(), "Remote access enabled.")
                    }
                  >
                    Enable remote access
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Connect this node to your tailnet to enable remote access.
              </p>
              <div>
                <GatedButton
                  scopes={["connections:manage"]}
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      const result = await startLogin()
                      setAuthUrl(result.authUrl)
                      if (!result.authUrl) {
                        throw new Error(
                          "No login URL returned. Check the sidecar logs."
                        )
                      }
                    }, "Login started.")
                  }
                >
                  Connect to tailnet
                </GatedButton>
              </div>
              {authUrl ? (
                <Alert>
                  <AlertTitle>Approve this node</AlertTitle>
                  <AlertDescription>
                    <a
                      href={authUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all underline"
                    >
                      {authUrl}
                    </a>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
          {!remote && canManage ? (
            <PanicLockdownButton
              pending={pending}
              onConfirm={() =>
                void run(async () => {
                  const result = await panicLockdown()
                  return result
                }, "Remote access locked down.")
              }
            />
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  )
}

function PanicLockdownButton({
  pending,
  onConfirm,
}: {
  pending: boolean
  onConfirm: () => void
}) {
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="text-sm font-medium">Emergency lockdown</div>
      <p className="text-xs text-muted-foreground">
        Revoke every connection, lock the Cloudflare vault, and turn off remote
        access in one step. Running pills keep serving.
      </p>
      <div>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="destructive" disabled={pending} />}
          >
            Lock down remote access
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Lock down remote access?</AlertDialogTitle>
              <AlertDialogDescription>
                This immediately revokes all paired connections, locks the
                Cloudflare vault, and disables Tailscale serve. Already running
                pills and tunnels are not affected. You can re-enable remote
                access afterwards from this host.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={onConfirm}
              >
                Lock down
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

function PairingCard({
  endpoints,
  links,
  tokens,
  now,
  pendingId,
  onCreated,
  onRevoke,
}: {
  endpoints: Array<EndpointRow>
  links: Array<PairingLinkRow>
  tokens: Record<string, string>
  now: number
  pendingId: string | null
  onCreated: (linkId: string, token: string) => void
  onRevoke: (linkId: string) => Promise<void>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pairing links</CardTitle>
        <CardDescription>
          Create a short-lived link for the browser you want to pair.
        </CardDescription>
        <CardAction>
          <CreatePairingLinkDialog
            endpoints={endpoints}
            onCreated={onCreated}
          />
        </CardAction>
      </CardHeader>
      {links.length ? (
        <ListRows>
          {links.map((link) => (
            <PairingLinkRow
              key={link.id}
              link={link}
              endpoints={endpoints}
              token={tokens[link.id]}
              now={now}
              pending={pendingId === link.id}
              onRevoke={onRevoke}
            />
          ))}
        </ListRows>
      ) : (
        <CardContent>
          <Empty className="border p-8">
            <EmptyHeader>
              <EmptyTitle>No active pairing links</EmptyTitle>
              <EmptyDescription>
                New pairing links you create will show up here until they are
                used or expire.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      )}
    </Card>
  )
}

function ScopeBadge({ scopes }: { scopes: Array<string> }) {
  const list = scopes as Array<AccessScope>

  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="outline" className="shrink-0" />}>
        {describeScopes(list)}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="flex flex-col gap-0.5">
          {list.map((scope) => (
            <span key={scope} className="font-mono text-xs">
              {scope}
            </span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function PairingLinkRow({
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
    <div className="flex items-center gap-3 px-4 py-3">
      <StatusDot className="bg-amber-500" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="truncate text-sm font-medium"
          title={`Created ${formatDateTime(link.createdAt)}`}
        >
          {link.label}
        </span>
        <span className="text-xs text-muted-foreground">{expiryLabel}</span>
      </div>
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
    <div className="flex w-full gap-1 rounded-lg bg-muted p-1">
      {endpoints.map((endpoint) => (
        <button
          key={endpoint.id}
          type="button"
          onClick={() => onChange(endpoint.id)}
          className={cn(
            "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            endpoint.id === value
              ? "bg-background text-foreground ring-1 ring-foreground/10"
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
  const [preset, setPreset] = useState<ConnectionScopePreset | "custom">(
    "viewer"
  )
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

  function handlePresetChange(next: ConnectionScopePreset | "custom") {
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
                    <code className="block w-full overflow-x-auto rounded-md bg-muted px-2.5 py-2 font-mono text-xs whitespace-nowrap">
                      {url}
                    </code>
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
                      {created ? (
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
                      ) : null}
                    </div>
                  </div>
                  {selectedEndpoint ? (
                    <EndpointHints endpoint={selectedEndpoint} />
                  ) : null}
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <Alert>
                    <AlertTitle>Remote access not enabled</AlertTitle>
                    <AlertDescription>
                      Enable remote access above to pair over Tailscale, or copy
                      the pairing code below to enter it manually.
                    </AlertDescription>
                  </Alert>
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

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Permissions</span>
                <RadioGroup
                  value={preset}
                  onValueChange={(value) =>
                    handlePresetChange(
                      value as ConnectionScopePreset | "custom"
                    )
                  }
                >
                  {(["viewer", "operator", "fullAdmin"] as const).map(
                    (name) => (
                      <label
                        key={name}
                        className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
                      >
                        <RadioGroupItem value={name} className="mt-0.5" />
                        <span className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">
                            {presetMeta[name].label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {presetMeta[name].description}
                          </span>
                        </span>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="ml-auto inline-flex shrink-0 self-center text-muted-foreground hover:text-foreground" />
                            }
                          >
                            <InfoIcon className="size-4" />
                            <span className="sr-only">
                              Show {presetMeta[name].label} scopes
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="flex flex-col gap-0.5">
                              {connectionScopePresets[name].map((scope) => (
                                <span key={scope} className="font-mono text-xs">
                                  {scope}
                                </span>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </label>
                    )
                  )}
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                    <RadioGroupItem value="custom" className="mt-0.5" />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">Custom</span>
                      <span className="text-xs text-muted-foreground">
                        Pick exactly which permissions to grant.
                      </span>
                    </span>
                  </label>
                </RadioGroup>
              </div>

              {preset === "custom" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {scopeGroups.map((group) => (
                    <div key={group.domain} className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {group.label}
                      </span>
                      {group.scopes.map((scope) => {
                        const disabled = !canGrant(scope)
                        return (
                          <label
                            key={scope}
                            className={cn(
                              "flex items-center gap-2 text-xs",
                              disabled
                                ? "cursor-not-allowed opacity-50"
                                : "cursor-pointer"
                            )}
                          >
                            <Checkbox
                              checked={customScopes.includes(scope)}
                              disabled={disabled}
                              onCheckedChange={() => toggleCustomScope(scope)}
                            />
                            <span className="font-mono">{scope}</span>
                          </label>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ) : null}

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

function ConnectionsCard({
  connections,
  pendingId,
  onRename,
  onRevoke,
}: {
  connections: Array<ConnectionRow>
  pendingId: string | null
  onRename: (sessionId: string, label: string) => Promise<void>
  onRevoke: (sessionId: string) => Promise<void>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Paired connections</CardTitle>
        <CardDescription>
          Permanent browser credentials can be renamed or revoked here.
        </CardDescription>
      </CardHeader>
      {connections.length ? (
        <ListRows>
          {connections.map((connection) => (
            <ConnectionRowItem
              key={connection.id}
              connection={connection}
              pending={pendingId === connection.id}
              onRename={onRename}
              onRevoke={onRevoke}
            />
          ))}
        </ListRows>
      ) : (
        <CardContent>
          <Empty className="border p-8">
            <EmptyHeader>
              <EmptyTitle>No paired connections yet</EmptyTitle>
              <EmptyDescription>
                Pair a browser with a link above and it will appear here with
                permanent access.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      )}
    </Card>
  )
}

function ConnectionRowItem({
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
    <div className="flex items-center gap-3 px-4 py-3">
      <StatusDot
        className={
          connection.connectedNow ? "bg-emerald-500" : "bg-muted-foreground/40"
        }
        ping={connection.connectedNow}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">
            {connection.label}
          </span>
          {connection.isCurrent ? (
            <Badge variant="outline" className="shrink-0">
              This device
            </Badge>
          ) : null}
          <ScopeBadge scopes={connection.scopes} />
          <RenameConnectionDialog connection={connection} onRename={onRename} />
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {deviceSummary(connection)}
        </span>
      </div>
      <RevokeConnectionButton
        connection={connection}
        pending={pending}
        onRevoke={onRevoke}
      />
    </div>
  )
}

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
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" />}>
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

function deviceSummary(connection: ConnectionRow) {
  const browser = connection.metadata.browser ?? "Unknown browser"
  const os = connection.metadata.os
  const bits = [
    os ? `${browser} on ${os}` : browser,
    connection.metadata.device,
    connection.metadata.tailnetIdentity
      ? `paired by ${connection.metadata.tailnetIdentity}`
      : null,
    connection.remoteAddr,
    connection.connectedNow
      ? "Active now"
      : `Last seen ${formatNullableDate(connection.lastSeenAt)}`,
  ].filter(Boolean)

  return bits.join(" · ")
}

function useNow() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  return now
}

function buildPairingUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/pair#token=${encodeURIComponent(token)}`
}

async function copyText(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(message)
  } catch {
    toast.error("Could not copy to clipboard.")
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatNullableDate(value: string | null) {
  return value ? formatDateTime(value) : "never"
}

function formatCountdown(value: string, now: number) {
  const remaining = new Date(value).getTime() - now
  if (remaining <= 0) {
    return "Expired"
  }

  const totalSeconds = Math.ceil(remaining / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}
