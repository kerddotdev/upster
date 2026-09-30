import { useMemo, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { BanIcon } from "lucide-react"
import { toast } from "sonner"

import { AccessDenied } from "@/components/access-denied"
import {
  Details,
  EmptyState,
  ExpandableRow,
  List,
  Page,
  Row,
  Section,
} from "@/components/layout"
import { StatusBadge, StatusDot, type Tone } from "@/components/status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GatedButton } from "@/features/auth/gated-button"
import {
  listSecurityEventsFn,
  listSessionsFn,
  revokeSessionFn,
} from "@/features/sessions/session.functions"

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

type SessionSort = "status" | "lastSeen" | "expires" | "label" | "kind"

const sortLabels: Record<SessionSort, string> = {
  status: "Status",
  lastSeen: "Last seen",
  expires: "Expires",
  label: "Label",
  kind: "Type",
}

const statusLabels: Record<SessionStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
}

const statusTones: Record<SessionStatus, Tone> = {
  active: "success",
  expired: "idle",
  revoked: "danger",
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

const PAGE_SIZE = 10

function timeOf(value: string | null) {
  return value ? new Date(value).getTime() : 0
}

const comparators: Record<
  SessionSort,
  (a: SessionRow, b: SessionRow) => number
> = {
  status: (a, b) =>
    statusSortOrder[a.status] - statusSortOrder[b.status] ||
    timeOf(b.lastSeenAt) - timeOf(a.lastSeenAt),
  lastSeen: (a, b) => timeOf(b.lastSeenAt) - timeOf(a.lastSeenAt),
  expires: (a, b) => timeOf(b.expiresAt) - timeOf(a.expiresAt),
  label: (a, b) => a.label.localeCompare(b.label),
  kind: (a, b) => a.kind.localeCompare(b.kind),
}

function matchesQuery(session: SessionRow, query: string) {
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
}

function SessionsPage() {
  const { sessions, auditEvents } = Route.useLoaderData()
  const revokeSession = useServerFn(revokeSessionFn)
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [sort, setSort] = useState<SessionSort>("status")
  const [query, setQuery] = useState("")
  const [kindFilter, setKindFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [limit, setLimit] = useState(PAGE_SIZE)

  const rows = useMemo<Array<SessionRow>>(
    () =>
      sessions.map((session) => ({
        ...session,
        status: getSessionStatus(session),
      })),
    [sessions]
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows
      .filter(
        (row) =>
          (kindFilter === "all" || row.kind === kindFilter) &&
          (statusFilter === "all" || row.status === statusFilter) &&
          (!needle || matchesQuery(row, needle))
      )
      .sort(comparators[sort])
  }, [rows, query, kindFilter, statusFilter, sort])

  async function handleRevoke(sessionId: string) {
    setPendingId(sessionId)
    try {
      await revokeSession({ data: { sessionId } })
      toast.success("Session revoked.")
      await router.invalidate()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke session."
      )
    } finally {
      setPendingId(null)
    }
  }

  const visible = filtered.slice(0, limit)

  return (
    <Page
      title="Sessions"
      description="Review dashboard, CLI, and agent access to this Upster instance."
      actions={
        <Select
          value={sort}
          onValueChange={(value) => setSort(value as SessionSort)}
        >
          <SelectTrigger size="sm" aria-label="Sort sessions">
            <SelectValue>
              {(value) => `Sort: ${sortLabels[value as SessionSort]}`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {Object.entries(sortLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      }
    >
      <Section
        title="Access sessions"
        description="Revoked or expired sessions can no longer call the dashboard or CLI API."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by label, ID, scope, or user agent"
            aria-label="Filter sessions"
            className="max-w-md min-w-56 flex-1"
          />
          <Select
            value={kindFilter}
            onValueChange={(value) => setKindFilter(String(value))}
          >
            <SelectTrigger aria-label="Filter by session type">
              <SelectValue>
                {(value) => kindFilterLabels[String(value)] ?? "All types"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(kindFilterLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(String(value))}
          >
            <SelectTrigger aria-label="Filter by session status">
              <SelectValue>
                {(value) => statusFilterLabels[String(value)] ?? "All statuses"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(statusFilterLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {visible.length ? (
          <List>
            {visible.map((session) => (
              <SessionRowItem
                key={session.id}
                session={session}
                pending={pendingId === session.id}
                onRevoke={handleRevoke}
              />
            ))}
          </List>
        ) : (
          <EmptyState>No sessions match the current filters.</EmptyState>
        )}

        {filtered.length > visible.length && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing {visible.length} of {filtered.length} sessions.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLimit(limit + PAGE_SIZE)}
            >
              Show more
            </Button>
          </div>
        )}
      </Section>

      <SecurityAudit events={auditEvents} />
    </Page>
  )
}

function SessionRowItem({
  session,
  pending,
  onRevoke,
}: {
  session: SessionRow
  pending: boolean
  onRevoke: (sessionId: string) => Promise<void>
}) {
  return (
    <ExpandableRow
      title={session.label}
      summary={`${kindFilterLabels[session.kind]} - last seen ${formatDate(session.lastSeenAt)}`}
      aside={
        <StatusBadge
          tone={statusTones[session.status]}
          label={statusLabels[session.status]}
        />
      }
      actions={
        <GatedButton
          scopes={["sessions:revoke"]}
          variant="secondary"
          size="sm"
          disabled={session.status !== "active" || pending}
          onClick={() => onRevoke(session.id)}
        >
          <BanIcon data-icon="inline-start" />
          Revoke
        </GatedButton>
      }
    >
      <Details
        items={[
          ["ID", session.id],
          ["Subject", session.subject],
          ["Created", formatDate(session.createdAt)],
          ["Last seen", formatDate(session.lastSeenAt)],
          ["Expires", formatDate(session.expiresAt)],
          ["Revoked", session.revokedAt && formatDate(session.revokedAt)],
          ["Address", session.remoteAddr],
          ["User agent", session.userAgent],
        ]}
      />
      {session.scopes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {session.scopes.map((scope) => (
            <Badge key={scope} variant="secondary">
              {scope}
            </Badge>
          ))}
        </div>
      )}
    </ExpandableRow>
  )
}

function SecurityAudit({ events }: { events: Array<AuditEventRow> }) {
  return (
    <Section
      title="Security audit"
      description="Denied access attempts, pairings, revocations, logins and lockdowns."
    >
      {events.length === 0 ? (
        <EmptyState>No security events recorded yet.</EmptyState>
      ) : (
        <List>
          {events.map((event) => (
            <Row
              key={event.id}
              leading={
                <StatusDot
                  tone={
                    auditDestructiveTypes.has(event.type) ? "danger" : "idle"
                  }
                />
              }
              title={auditTypeLabels[event.type] ?? event.type}
              detail={[event.actorKind, event.message]
                .filter(Boolean)
                .join(" - ")}
              trailing={
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {formatDate(event.createdAt)}
                </span>
              }
            />
          ))}
        </List>
      )}
    </Section>
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
