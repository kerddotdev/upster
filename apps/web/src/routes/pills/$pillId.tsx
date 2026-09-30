import { useState } from "react"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Details,
  EmptyState,
  List,
  Mono,
  Page,
  Row,
  Section,
  StatCard,
} from "@/components/layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  MetricsRaw,
  MetricsSummary,
  useTunnelMetrics,
} from "@/features/metrics/metrics-panel"
import { CapsuleActions } from "@/features/capsules/components/capsule-actions"
import { CapsuleManager } from "@/features/capsules/components/capsule-manager"
import { ClearDiagnosticsButton } from "@/features/pills/components/clear-diagnostics-button"
import { PillActions } from "@/features/pills/components/pill-actions"
import { PillDiagnostics } from "@/features/pills/components/pill-diagnostics"
import { StatusBadge } from "@/features/pills/components/status-badge"
import { getPillStatusFn } from "@/features/pills/pill.functions"
import { TerminalOutput } from "@/features/terminal/terminal-output"
import { AccessDenied } from "@/components/access-denied"
import { useHasScopes } from "@/features/auth/use-scopes"

export const Route = createFileRoute("/pills/$pillId")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  loader: ({ params }) => getPillStatusFn({ data: { pillId: params.pillId } }),
  errorComponent: AccessDenied,
  component: PillDetailPage,
})

function PillDetailPage() {
  const router = useRouter()
  const navigate = Route.useNavigate()
  const { tab } = Route.useSearch()
  const pill = Route.useLoaderData()
  const [capsuleKey, setCapsuleKey] = useState(0)
  const [diagnosticsKey, setDiagnosticsKey] = useState(0)
  const runId = pill.activeRun?.id ?? null
  const expiresAt = pill.activeRun?.expiresAt ?? null
  const canReadLogs = useHasScopes("logs:read")
  const canReadMetrics = useHasScopes("metrics:read")
  const metrics = useTunnelMetrics(runId, canReadMetrics)

  return (
    <Page
      title={pill.name}
      description={
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusBadge status={pill.status} source={pill.activeRun?.source} />
          <Mono>{pill.repoPath}</Mono>
        </span>
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            render={<Link to="/" />}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            <span className="max-sm:sr-only">Pills</span>
          </Button>
          <PillActions
            pill={pill}
            expiresAt={expiresAt}
            showEdit
            editPill={pill}
            showDetails={false}
          />
        </>
      }
    >
      <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-4">
        <StatCard
          label="Hostname"
          value={
            pill.hostname ? (
              <a
                href={`https://${pill.hostname}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 rounded-md text-[15px] text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <span className="truncate">{pill.hostname}</span>
                <ExternalLinkIcon className="size-3.5 shrink-0" />
              </a>
            ) : (
              "-"
            )
          }
        />
        <StatCard label="App port" value={String(pill.appPort ?? "-")} />
        <StatCard
          label="Metrics port"
          value={String(pill.metricsPort ?? "-")}
        />
        <StatCard
          label="Tunnel"
          value={
            <span className="block truncate text-[15px]">
              {pill.tunnel?.tunnelName ?? "Not created"}
            </span>
          }
        />
      </div>

      {canReadMetrics ? <MetricsSummary metrics={metrics} /> : null}

      <Tabs
        value={tab ?? "overview"}
        onValueChange={(value) => void navigate({ search: { tab: value } })}
        className="gap-6"
      >
        <TabsList className="max-w-full [scrollbar-width:none] justify-start overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="capsules">Capsules</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          {canReadLogs ? (
            <TabsTrigger value="terminal">Terminal</TabsTrigger>
          ) : null}
          {canReadMetrics ? (
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-10">
          <Section
            title="Command profiles"
            description="Commands Upster can run for this pill."
          >
            <List>
              {pill.commands.map((command) => (
                <Row
                  key={command.id}
                  title={command.name}
                  detail={
                    <span className="flex flex-col gap-0.5">
                      <Mono>{command.argv.join(" ")}</Mono>
                      <span>
                        cwd <Mono>{command.cwd}</Mono>
                      </span>
                    </span>
                  }
                />
              ))}
            </List>
          </Section>

          <Section title="Run" description="Current run details.">
            {pill.activeRun ? (
              <div className="rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border">
                <Details
                  items={[
                    ["Command", pill.activeRun.commandName],
                    ["Started", pill.activeRun.startedAt],
                    ["Expires", pill.activeRun.expiresAt ?? "No expiry"],
                    ["App PID", String(pill.activeRun.appPid ?? "-")],
                    ["Tunnel PID", String(pill.activeRun.tunnelPid ?? "-")],
                  ]}
                />
              </div>
            ) : (
              <EmptyState>No active run.</EmptyState>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="capsules">
          <Section
            title="Capsules"
            description="Frozen, isolated snapshots of the source. Deploy, browse, or roll back to any version."
            actions={
              <CapsuleActions
                pillId={pill.id}
                onChanged={() => {
                  setCapsuleKey((value) => value + 1)
                  void router.invalidate()
                }}
              />
            }
          >
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
              onChanged={() => router.invalidate()}
            />
          </Section>
        </TabsContent>

        <TabsContent value="diagnostics">
          <Section
            title="Diagnostics"
            description="Recent runs, exit codes, error output, and capsule build failures for this pill."
            actions={
              <ClearDiagnosticsButton
                pillId={pill.id}
                onCleared={() => setDiagnosticsKey((value) => value + 1)}
              />
            }
          >
            <PillDiagnostics key={diagnosticsKey} pillId={pill.id} />
          </Section>
        </TabsContent>

        {canReadLogs ? (
          <TabsContent value="terminal">
            <Section
              title="Terminal"
              description="Live output from the app process and cloudflared."
            >
              <div className="h-[28rem]">
                <TerminalOutput runId={runId} initialLogs={pill.recentLogs} />
              </div>
            </Section>
          </TabsContent>
        ) : null}

        {canReadMetrics ? (
          <TabsContent value="metrics">
            <Section
              title="Tunnel metrics"
              description="Prometheus output from the local metrics server."
            >
              <MetricsRaw runId={runId} metrics={metrics} />
            </Section>
          </TabsContent>
        ) : null}
      </Tabs>
    </Page>
  )
}
