import { useEffect, useState, type FormEvent } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import {
  CheckCircle2Icon,
  CopyIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { QrCode } from "@/components/qr-code"
import {
  createPairingLinkFn,
  getConnectionEndpointsFn,
  listConnectionsFn,
  listPairingLinksFn,
  renameConnectionFn,
  revokeConnectionFn,
  revokePairingLinkFn,
} from "@/features/connections/connection.functions"

export const Route = createFileRoute("/connections")({
  loader: loadConnectionsPage,
  component: ConnectionsPage,
})

async function loadConnectionsPage() {
  const [connections, pairingLinks, endpoints] = await Promise.all([
    listConnectionsFn(),
    listPairingLinksFn(),
    getConnectionEndpointsFn(),
  ])

  return { connections, pairingLinks, endpoints }
}

type LoaderData = Awaited<ReturnType<typeof loadConnectionsPage>>
type ConnectionRow = LoaderData["connections"][number]
type PairingLinkRow = LoaderData["pairingLinks"][number]
type EndpointRow = LoaderData["endpoints"][number]

function ConnectionsPage() {
  const { connections, pairingLinks, endpoints } = Route.useLoaderData()
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

  async function handleRevokePairingLink(linkId: string) {
    setPendingPairingLinkId(linkId)
    try {
      await revokePairingLink({ data: { linkId } })
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
        <h1 className="text-xl font-medium">Connections</h1>
        <p className="text-sm text-muted-foreground">
          Pair trusted browsers and manage their permanent access.
        </p>
      </div>

      <PairingCard
        endpoints={endpoints}
        links={pairingLinks}
        now={now}
        pendingId={pendingPairingLinkId}
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

function EndpointHints({ endpoint }: { endpoint: EndpointRow }) {
  const hints = [
    endpoint.current ? "You are connected via this origin." : null,
    endpoint.setupRequired
      ? "Tailscale setup required - run bun run tailscale:setup."
      : null,
    endpoint.stale
      ? "Status file is stale - run bun run tailscale:setup on the host."
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

function PairingCard({
  endpoints,
  links,
  now,
  pendingId,
  onRevoke,
}: {
  endpoints: Array<EndpointRow>
  links: Array<PairingLinkRow>
  now: number
  pendingId: string | null
  onRevoke: (linkId: string) => Promise<void>
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>Pairing links</CardTitle>
          <CardDescription>
            Create a short-lived link for the browser you want to pair.
          </CardDescription>
        </div>
        <CreatePairingLinkDialog endpoints={endpoints} />
      </CardHeader>
      <CardContent>
        {links.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-20 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className="font-medium">{link.label}</TableCell>
                  <TableCell>{formatDateTime(link.createdAt)}</TableCell>
                  <TableCell>{formatCountdown(link.expiresAt, now)}</TableCell>
                  <TableCell className="text-right">
                    <RevokePairingLinkButton
                      link={link}
                      pending={pendingId === link.id}
                      onRevoke={onRevoke}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No active pairing links.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CreatePairingLinkDialog({
  endpoints,
}: {
  endpoints: Array<EndpointRow>
}) {
  const router = useRouter()
  const createPairingLink = useServerFn(createPairingLinkFn)
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedLabel = label.trim()
    if (!trimmedLabel) {
      return
    }

    setPending(true)
    try {
      const result = await createPairingLink({
        data: { label: trimmedLabel },
      })
      setCreated(result)
      setSelectedEndpointId(endpoints[0]?.id ?? "")
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
    setCreated(null)
    setSelectedEndpointId(endpoints[0]?.id ?? "")
    setPending(false)
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New pairing link</DialogTitle>
          <DialogDescription>
            The token is shown once and expires after 5 minutes.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <CheckCircle2Icon />
              <AlertTitle>Pairing link ready</AlertTitle>
              <AlertDescription>
                This link is shown only once and expires in 5 minutes.
              </AlertDescription>
            </Alert>

            <Tabs
              value={selectedEndpoint?.id ?? ""}
              onValueChange={setSelectedEndpointId}
            >
              <TabsList className="max-w-full overflow-x-auto">
                {endpoints.map((endpoint) => (
                  <TabsTrigger key={endpoint.id} value={endpoint.id}>
                    {endpoint.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {endpoints.map((endpoint) => {
                const url = endpoint.origin
                  ? buildPairingUrl(endpoint.origin, created.token)
                  : null

                return (
                  <TabsContent
                    key={endpoint.id}
                    value={endpoint.id}
                    className="flex flex-col gap-3"
                  >
                    {url ? (
                      <>
                        <div className="flex flex-col gap-2 rounded-lg border p-3">
                          <div className="text-xs font-medium">Pairing URL</div>
                          <code className="rounded bg-muted px-2 py-1.5 font-mono text-[0.6875rem] break-all">
                            {url}
                          </code>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void copyText(url, "Pairing URL copied.")
                              }
                            >
                              <CopyIcon data-icon="inline-start" />
                              Copy URL
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                          <QrCode value={url} className="w-48 max-w-full" />
                          <div className="flex flex-col justify-center gap-1 text-sm text-muted-foreground">
                            <div className="font-medium text-foreground">
                              Scan from the device you want to pair.
                            </div>
                            <div>
                              Use the origin that device will use for the
                              dashboard.
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <Alert>
                        <AlertTitle>Tailscale setup required</AlertTitle>
                        <AlertDescription>
                          Run bun run tailscale:setup on the host, then reopen
                          this dialog.
                        </AlertDescription>
                      </Alert>
                    )}
                    <EndpointHints endpoint={endpoint} />
                  </TabsContent>
                )
              })}
            </Tabs>
          </div>
        ) : (
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
            <Button type="submit" disabled={pending || !label.trim()}>
              {pending ? "Creating..." : "Create pairing link"}
            </Button>
          </form>
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
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <Trash2Icon />
        <span className="sr-only">Revoke pairing link</span>
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
      <CardContent>
        {connections.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((connection) => (
                <TableRow key={connection.id}>
                  <TableCell className="min-w-56">
                    <ConnectionLabelCell
                      connection={connection}
                      onRename={onRename}
                    />
                  </TableCell>
                  <TableCell>
                    <DeviceSummary connection={connection} />
                  </TableCell>
                  <TableCell>{formatDateTime(connection.createdAt)}</TableCell>
                  <TableCell>
                    {formatNullableDate(connection.lastSeenAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {connection.connectedNow ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          Connected now
                        </Badge>
                      ) : null}
                      {connection.isCurrent ? (
                        <Badge variant="outline">This device</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <RevokeConnectionButton
                      connection={connection}
                      pending={pendingId === connection.id}
                      onRevoke={onRevoke}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No paired connections yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ConnectionLabelCell({
  connection,
  onRename,
}: {
  connection: ConnectionRow
  onRename: (sessionId: string, label: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(connection.label)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!editing) {
      setValue(connection.label)
    }
  }, [connection.label, editing])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || trimmed === connection.label) {
      setEditing(false)
      return
    }

    setPending(true)
    try {
      await onRename(connection.id, trimmed)
      setEditing(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to rename connection."
      )
    } finally {
      setPending(false)
    }
  }

  if (editing) {
    return (
      <form className="flex min-w-60 items-center gap-2" onSubmit={submit}>
        <Input
          aria-label="Connection label"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={64}
          autoFocus
        />
        <Button size="sm" type="submit" disabled={pending || !value.trim()}>
          Save
        </Button>
        <Button
          size="icon-sm"
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setEditing(false)}
        >
          <XIcon />
          <span className="sr-only">Cancel rename</span>
        </Button>
      </form>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium">{connection.label}</span>
      <Button
        size="icon-xs"
        variant="ghost"
        type="button"
        onClick={() => setEditing(true)}
      >
        <PencilIcon />
        <span className="sr-only">Rename connection</span>
      </Button>
    </div>
  )
}

function DeviceSummary({ connection }: { connection: ConnectionRow }) {
  const browser = connection.metadata.browser ?? "Unknown browser"
  const os = connection.metadata.os
  const device = connection.metadata.device

  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium">
        {browser}
        {os ? ` on ${os}` : ""}
      </div>
      <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
        {device ? <span>{device}</span> : null}
        {connection.remoteAddr ? <span>{connection.remoteAddr}</span> : null}
      </div>
    </div>
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
  if (connection.isCurrent) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        disabled
        title="Use logout instead"
      >
        <Trash2Icon />
        <span className="sr-only">Use logout instead</span>
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <Trash2Icon />
        <span className="sr-only">Revoke connection</span>
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
  return value ? formatDateTime(value) : "Never"
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
