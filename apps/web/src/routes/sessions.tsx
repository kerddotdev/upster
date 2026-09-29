import { useMemo, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import {
  ArrowUpDownIcon,
  BanIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  listSecurityEventsFn,
  listSessionsFn,
  revokeSessionFn,
} from "@/features/sessions/session.functions"
import { AccessDenied } from "@/components/access-denied"
import { GatedButton } from "@/features/auth/gated-button"

export const Route = createFileRoute("/sessions")({
  loader: loadSessionsPage,
  errorComponent: AccessDenied,
  component: SessionsPage,
})

async function loadSessionsPage() {
  const [sessions, auditEvents] = await Promise.all([
    listSessionsFn(),
    listSecurityEventsFn(),
  ])

  return { sessions, auditEvents }
}

type AuditEventRow = Awaited<
  ReturnType<typeof loadSessionsPage>
>["auditEvents"][number]

const auditTypeLabels: Record<string, string> = {
  "security.scope_denied": "Scope denied",
  "security.escalation_denied": "Escalation denied",
  "security.paired": "Connection paired",
  "security.connection_revoked": "Connection revoked",
  "security.connection_scopes_updated": "Scopes updated",
  "security.login": "Admin login",
  "security.panic": "Emergency lockdown",
}

const auditDestructiveTypes = new Set([
  "security.scope_denied",
  "security.escalation_denied",
  "security.panic",
])

type SessionKind = "dashboard" | "cli" | "agent"
type SessionStatus = "active" | "expired" | "revoked"

type SessionRow = {
  id: string
  kind: SessionKind
  subject: string
  label: string
  scopes: Array<string>
  createdAt: string
  lastSeenAt: string | null
  expiresAt: string
  revokedAt: string | null
  userAgent: string | null
  remoteAddr: string | null
  status: SessionStatus
}

type SessionTableProps = {
  sessions: Array<SessionRow>
  pendingId: string | null
  onRevoke: (sessionId: string) => Promise<void>
}

const statusLabels: Record<SessionStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
}

const kindFilterLabels: Record<string, string> = {
  all: "All types",
  dashboard: "Dashboard",
  cli: "CLI",
  agent: "Agent",
}

const statusFilterLabels: Record<string, string> = {
  all: "All statuses",
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
}

const statusSortOrder: Record<SessionStatus, number> = {
  active: 0,
  expired: 1,
  revoked: 2,
}

function SessionsPage() {
  const { sessions, auditEvents } = Route.useLoaderData()
  const revokeSession = useServerFn(revokeSessionFn)
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const rows = useMemo(
    () =>
      sessions.map((session) => ({
        ...session,
        status: getSessionStatus(session),
      })),
    [sessions]
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          Review dashboard, CLI, and agent access to this Upster instance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Access sessions</CardTitle>
          <CardDescription>
            Revoked or expired sessions can no longer call the dashboard or CLI
            API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionsTable
            sessions={rows}
            pendingId={pendingId}
            onRevoke={async (sessionId) => {
              setPendingId(sessionId)
              try {
                await revokeSession({
                  data: { sessionId },
                })
                toast.success("Session revoked.")
                await router.invalidate()
              } catch (err) {
                toast.error(
                  err instanceof Error
                    ? err.message
                    : "Failed to revoke session."
                )
              } finally {
                setPendingId(null)
              }
            }}
          />
        </CardContent>
      </Card>

      <SecurityAuditCard events={auditEvents} />
    </div>
  )
}

function SecurityAuditCard({ events }: { events: Array<AuditEventRow> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security audit</CardTitle>
        <CardDescription>
          Denied access attempts, pairings, revocations, logins and lockdowns.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No security events recorded yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(event.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        auditDestructiveTypes.has(event.type)
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {auditTypeLabels[event.type] ?? event.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {event.actorKind ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {event.message}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function SessionsTable({ sessions, pendingId, onRevoke }: SessionTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "status", desc: false },
    { id: "lastSeenAt", desc: true },
  ])
  const [globalFilter, setGlobalFilter] = useState("")
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const columns = useMemo(
    () => createSessionColumns({ pendingId, onRevoke }),
    [pendingId, onRevoke]
  )
  const table = useReactTable({
    data: sessions,
    columns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue).trim().toLowerCase()
      if (!query) {
        return true
      }

      const session = row.original
      return [
        session.id,
        session.kind,
        session.subject,
        session.label,
        session.userAgent ?? "",
        session.remoteAddr ?? "",
        ...session.scopes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })
  const kindFilter = String(table.getColumn("kind")?.getFilterValue() ?? "all")
  const statusFilter = String(
    table.getColumn("status")?.getFilterValue() ?? "all"
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Input
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="Filter by label, ID, scope, or user agent"
          aria-label="Filter sessions"
          className="max-w-md"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={kindFilter}
            onValueChange={(value) =>
              table
                .getColumn("kind")
                ?.setFilterValue(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger aria-label="Filter by session type">
              <SelectValue>
                {(value) => kindFilterLabels[String(value)] ?? "All types"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="dashboard">Dashboard</SelectItem>
                <SelectItem value="cli">CLI</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              table
                .getColumn("status")
                ?.setFilterValue(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger aria-label="Filter by session status">
              <SelectValue>
                {(value) => statusFilterLabels[String(value)] ?? "All statuses"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setGlobalFilter("")
              table.resetColumnFilters()
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No sessions match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {table.getRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} filtered sessions.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger aria-label="Rows per page">
              <SelectValue>{(value) => `${String(value)} rows`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {[10, 20, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={String(pageSize)}>
                    {pageSize} rows
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount() || 1}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.setPageIndex(0)}
              aria-label="First page"
            >
              <ChevronsLeftIcon data-icon="icon-only" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              aria-label="Previous page"
            >
              <ChevronLeftIcon data-icon="icon-only" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              aria-label="Next page"
            >
              <ChevronRightIcon data-icon="icon-only" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              aria-label="Last page"
            >
              <ChevronsRightIcon data-icon="icon-only" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function createSessionColumns({
  pendingId,
  onRevoke,
}: {
  pendingId: string | null
  onRevoke: (sessionId: string) => Promise<void>
}): Array<ColumnDef<SessionRow>> {
  return [
    {
      accessorKey: "kind",
      header: ({ column }) => (
        <SortableHeader
          label="Type"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        />
      ),
      filterFn: "equalsString",
      cell: ({ row }) => <Badge variant="outline">{row.original.kind}</Badge>,
    },
    {
      accessorKey: "label",
      header: ({ column }) => (
        <SortableHeader
          label="Label"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        />
      ),
      cell: ({ row }) => (
        <div className="flex min-w-56 flex-col gap-1">
          <div className="font-medium">{row.original.label}</div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {row.original.id}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "scopes",
      header: "Scopes",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex max-w-80 flex-wrap gap-1">
          {row.original.scopes.slice(0, 6).map((scope) => (
            <Badge key={scope} variant="secondary">
              {scope}
            </Badge>
          ))}
          {row.original.scopes.length > 6 && (
            <Badge variant="outline">+{row.original.scopes.length - 6}</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "lastSeenAt",
      header: ({ column }) => (
        <SortableHeader
          label="Last seen"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        />
      ),
      sortingFn: "datetime",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.lastSeenAt)}
        </span>
      ),
    },
    {
      accessorKey: "expiresAt",
      header: ({ column }) => (
        <SortableHeader
          label="Expires"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        />
      ),
      sortingFn: "datetime",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.expiresAt)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <SortableHeader
          label="Status"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        />
      ),
      filterFn: "equalsString",
      sortingFn: (a, b) =>
        statusSortOrder[a.original.status] - statusSortOrder[b.original.status],
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === "active" ? "default" : "outline"}
        >
          {statusLabels[row.original.status]}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <GatedButton
          scopes={["sessions:revoke"]}
          variant="outline"
          size="sm"
          disabled={
            row.original.status !== "active" || pendingId === row.original.id
          }
          onClick={() => onRevoke(row.original.id)}
        >
          <BanIcon data-icon="inline-start" />
          Revoke
        </GatedButton>
      ),
    },
  ]
}

function SortableHeader({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2" onClick={onClick}>
      {label}
      <ArrowUpDownIcon data-icon="inline-end" />
    </Button>
  )
}

function getSessionStatus(session: {
  expiresAt: string
  revokedAt: string | null
}): SessionStatus {
  if (session.revokedAt) {
    return "revoked"
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    return "expired"
  }

  return "active"
}

function formatDate(value: string | null) {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
