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
        pill.hostname ? (
          <a
            href={`https://${pill.hostname}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 font-mono text-[12px] text-brand hover:underline"
          >
            <span className="truncate">{pill.hostname}</span>
            <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
          </a>
        ) : null
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
        <>
          <p className="text-xs text-muted-foreground">
            Path <Mono>{pill.repoPath}</Mono>
          </p>
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
        </>
      ) : null}
    </Row>
  )
}
