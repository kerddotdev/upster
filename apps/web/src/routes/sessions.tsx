import { useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { BanIcon } from "lucide-react"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  listSessionsFn,
  revokeSessionFn,
} from "@/features/sessions/session.functions"

export const Route = createFileRoute("/sessions")({
  loader: () => listSessionsFn(),
  component: SessionsPage,
})

function SessionsPage() {
  const sessions = Route.useLoaderData()
  const revokeSession = useServerFn(revokeSessionFn)
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => {
                const revoked = Boolean(session.revokedAt)
                const expired =
                  new Date(session.expiresAt).getTime() <= Date.now()
                const active = !revoked && !expired

                return (
                  <TableRow key={session.id}>
                    <TableCell>
                      <Badge variant="outline">{session.kind}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{session.label}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {session.id}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-72">
                      <div className="flex flex-wrap gap-1">
                        {session.scopes.slice(0, 6).map((scope) => (
                          <Badge key={scope} variant="secondary">
                            {scope}
                          </Badge>
                        ))}
                        {session.scopes.length > 6 && (
                          <Badge variant="outline">
                            +{session.scopes.length - 6}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(session.lastSeenAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(session.expiresAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={active ? "default" : "outline"}>
                        {revoked ? "Revoked" : expired ? "Expired" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!active || pendingId === session.id}
                        onClick={async () => {
                          setPendingId(session.id)
                          try {
                            await revokeSession({
                              data: { sessionId: session.id },
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
                      >
                        <BanIcon data-icon="inline-start" />
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
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
