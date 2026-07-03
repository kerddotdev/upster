import { useState } from "react"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  PlusCircleIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CapsuleManager } from "@/features/capsules/components/capsule-manager"
import { CreatePillDialog } from "@/features/pills/components/create-pill-dialog"
import { ExpiryPicker } from "@/features/pills/components/expiry-picker"
import { PillActions } from "@/features/pills/components/pill-actions"
import { StatusBadge } from "@/features/pills/components/status-badge"
import { listPillsFn } from "@/features/pills/pill.functions"
import type { PillListItem } from "@/features/pills/types"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/")({
  loader: () => listPillsFn(),
  component: App,
})

function App() {
  const pills = Route.useLoaderData()

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">Pills</h1>
          <p className="text-sm text-muted-foreground">
            Publish mounted mini apps through per-pill Cloudflare tunnels.
          </p>
        </div>
        <CreatePillDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
          <CardDescription>
            Start, stop, inspect ports, and jump into each active tunnel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pills.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pill</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Ports</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pills.map((pill) => (
                  <PillTableRow key={pill.id} pill={pill} />
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PlusCircleIcon />
                </EmptyMedia>
                <EmptyTitle>No pills yet</EmptyTitle>
                <EmptyDescription>
                  Add a mounted repo and Upster will manage its local port,
                  tunnel, logs, and metrics.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                Configure Cloudflare first if you want to start tunnels right
                away.
              </EmptyContent>
            </Empty>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function PillTableRow({ pill }: { pill: PillListItem }) {
  const router = useRouter()
  const [expiresAt, setExpiresAt] = useState<string | null>(
    pill.activeRun?.expiresAt ?? null
  )
  const [expanded, setExpanded] = useState(false)
  const isRunning = Boolean(pill.activeRun)

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-start gap-2">
            <Button
              size="icon-xs"
              variant="ghost"
              className="mt-0.5"
              aria-expanded={expanded}
              aria-label="Toggle capsules"
              onClick={() => setExpanded((value) => !value)}
            >
              <ChevronRightIcon
                className={cn("transition-transform", expanded && "rotate-90")}
              />
            </Button>
            <div className="flex flex-col">
              <Link
                to="/pills/$pillId"
                params={{ pillId: pill.id }}
                className="font-medium hover:underline"
              >
                {pill.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                {pill.repoPath}
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <StatusBadge status={pill.status} />
        </TableCell>
        <TableCell>
          {pill.hostname ? (
            <a
              href={`https://${pill.hostname}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {pill.hostname}
              <ExternalLinkIcon className="size-3" />
            </a>
          ) : (
            "-"
          )}
        </TableCell>
        <TableCell>
          <PortSummary appPort={pill.appPort} metricsPort={pill.metricsPort} />
        </TableCell>
        <TableCell className="min-w-[15rem]">
          <ExpiryPicker
            value={expiresAt}
            onChange={setExpiresAt}
            disabled={isRunning}
          />
        </TableCell>
        <TableCell className="text-right">
          <PillActions pill={pill} expiresAt={expiresAt} showDelete={false} />
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={6} className="p-4">
            <CapsuleManager
              pillId={pill.id}
              commandName={pill.defaultEnv}
              activeRun={
                pill.activeRun
                  ? {
                      id: pill.activeRun.id,
                      capsuleId: pill.activeRun.capsuleId,
                    }
                  : null
              }
              allowBrowse={false}
              onChanged={() => router.invalidate()}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}

function PortSummary({
  appPort,
  metricsPort,
}: {
  appPort: number | null
  metricsPort: number | null
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <PortValue label="App" value={appPort} />
      <PortValue label="Metrics" value={metricsPort} />
    </div>
  )
}

function PortValue({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex w-32 items-center justify-between gap-3 rounded-md border px-2 py-1">
      <span className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="font-mono text-xs">{value ?? "-"}</span>
    </div>
  )
}
