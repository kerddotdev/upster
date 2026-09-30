import { useState } from "react"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react"

import { AccessDenied } from "@/components/access-denied"
import { EmptyState, List, Mono, Page, Row } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { CapsuleActions } from "@/features/capsules/components/capsule-actions"
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
  errorComponent: AccessDenied,
  component: App,
})

function App() {
  const pills = Route.useLoaderData()

  return (
    <Page
      title="Pills"
      description="Publish mounted mini apps through per-pill Cloudflare tunnels."
      actions={<CreatePillDialog />}
    >
      {pills.length ? (
        <List>
          {pills.map((pill) => (
            <PillRow key={pill.id} pill={pill} />
          ))}
        </List>
      ) : (
        <EmptyState>
          No pills yet. Add a mounted repo and Upster will manage its local
          port, tunnel, logs, and metrics.
        </EmptyState>
      )}
    </Page>
  )
}

function PillRow({ pill }: { pill: PillListItem }) {
  const router = useRouter()
  const [expiresAt, setExpiresAt] = useState<string | null>(
    pill.activeRun?.expiresAt ?? null
  )
  const [expanded, setExpanded] = useState(false)
  const [capsuleKey, setCapsuleKey] = useState(0)
  const isRunning = Boolean(pill.activeRun)

  return (
    <Row
      leading={
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground"
          aria-expanded={expanded}
          aria-label="Toggle capsules"
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRightIcon
            className={cn("transition-transform", expanded && "rotate-90")}
          />
        </Button>
      }
      title={
        <Link
          to="/pills/$pillId"
          params={{ pillId: pill.id }}
          className="hover:underline"
        >
          {pill.name}
        </Link>
      }
      detail={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Mono className="break-normal">{pill.repoPath}</Mono>
          {pill.hostname ? (
            <a
              href={`https://${pill.hostname}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[12px] text-brand hover:underline"
            >
              {pill.hostname}
              <ExternalLinkIcon className="size-3" aria-hidden />
            </a>
          ) : null}
          <PortSummary appPort={pill.appPort} metricsPort={pill.metricsPort} />
        </div>
      }
      trailing={
        <>
          <StatusBadge status={pill.status} />
          <ExpiryPicker
            value={expiresAt}
            onChange={setExpiresAt}
            disabled={isRunning}
          />
          <PillActions pill={pill} expiresAt={expiresAt} showDelete={false} />
        </>
      }
    >
      {expanded ? (
        <CapsuleManager
          key={capsuleKey}
          pillId={pill.id}
          commandName={pill.defaultEnv}
          slug={pill.slug}
          expiresAt={expiresAt}
          activeRun={
            pill.activeRun
              ? {
                  id: pill.activeRun.id,
                  capsuleId: pill.activeRun.capsuleId,
                }
              : null
          }
          allowBrowse={false}
          headerActions={
            <CapsuleActions
              pillId={pill.id}
              onChanged={() => {
                setCapsuleKey((value) => value + 1)
                void router.invalidate()
              }}
            />
          }
          onChanged={() => router.invalidate()}
        />
      ) : null}
    </Row>
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
    <span className="inline-flex items-center gap-3">
      <PortValue label="App" value={appPort} />
      <PortValue label="Metrics" value={metricsPort} />
    </span>
  )
}

function PortValue({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <Mono className="text-foreground">{value ?? "-"}</Mono>
    </span>
  )
}
