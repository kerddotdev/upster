import { useState } from "react"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
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

export const Route = createFileRoute("/pills/$pillId")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  loader: ({ params }) => getPillStatusFn({ data: { pillId: params.pillId } }),
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
  const metrics = useTunnelMetrics(runId)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" render={<Link to="/" />}>
            <ArrowLeftIcon />
          </Button>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-medium">{pill.name}</h1>
              <StatusBadge status={pill.status} />
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {pill.repoPath}
            </p>
          </div>
        </div>
        <PillActions
          pill={pill}
          expiresAt={expiresAt}
          showEdit
          editPill={pill}
          showDetails={false}
        />
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FactCard
          label="Hostname"
          value={pill.hostname ?? "-"}
          href={pill.hostname ? `https://${pill.hostname}` : undefined}
        />
        <FactCard label="App port" value={String(pill.appPort ?? "-")} mono />
        <FactCard
          label="Metrics port"
          value={String(pill.metricsPort ?? "-")}
          mono
        />
        <FactCard
          label="Tunnel"
          value={pill.tunnel?.tunnelName ?? "not created"}
        />
      </div>

      <MetricsSummary metrics={metrics} />

      <Tabs
        value={tab ?? "overview"}
        onValueChange={(value) => void navigate({ search: { tab: value } })}
      >
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="capsules">Capsules</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Command profiles</CardTitle>
                <CardDescription>
                  Commands Upster can run for this pill.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {pill.commands.map((command, index) => (
                  <div key={command.id} className="flex flex-col gap-1">
                    {index > 0 && <Separator className="mb-2" />}
                    <div className="text-sm font-medium">{command.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {command.argv.join(" ")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      cwd {command.cwd}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Run</CardTitle>
                <CardDescription>Current run details.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {pill.activeRun ? (
                  <>
                    <Detail
                      label="Command"
                      value={pill.activeRun.commandName}
                    />
                    <Detail label="Started" value={pill.activeRun.startedAt} />
                    <Detail
                      label="Expires"
                      value={pill.activeRun.expiresAt ?? "no expiry"}
                    />
                    <Detail
                      label="App PID"
                      value={String(pill.activeRun.appPid ?? "-")}
                    />
                    <Detail
                      label="Tunnel PID"
                      value={String(pill.activeRun.tunnelPid ?? "-")}
                    />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No active run.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="capsules" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Capsules</CardTitle>
              <CardDescription>
                Frozen, isolated snapshots of the source. Deploy, browse, or
                roll back to any version.
              </CardDescription>
              <CardAction>
                <CapsuleActions
                  pillId={pill.id}
                  onChanged={() => {
                    setCapsuleKey((value) => value + 1)
                    void router.invalidate()
                  }}
                />
              </CardAction>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Diagnostics</CardTitle>
              <CardDescription>
                Recent runs, exit codes, error output, and capsule build
                failures for this pill.
              </CardDescription>
              <CardAction>
                <ClearDiagnosticsButton
                  pillId={pill.id}
                  onCleared={() => setDiagnosticsKey((value) => value + 1)}
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              <PillDiagnostics key={diagnosticsKey} pillId={pill.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="terminal" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Terminal</CardTitle>
              <CardDescription>
                Live output from the app process and cloudflared.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[28rem]">
              <TerminalOutput runId={runId} initialLogs={pill.recentLogs} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Tunnel metrics</CardTitle>
              <CardDescription>
                Prometheus output from the local metrics server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetricsRaw runId={runId} metrics={metrics} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function FactCard({
  label,
  value,
  href,
  mono,
}: {
  label: string
  value: string
  href?: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-3">
      <span className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-medium text-primary hover:underline"
        >
          <span className="truncate">{value}</span>
          <ExternalLinkIcon className="size-3 shrink-0" />
        </a>
      ) : (
        <span
          className={cn("truncate text-sm font-medium", mono && "font-mono")}
        >
          {value}
        </span>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-xs font-medium">{value}</span>
    </div>
  )
}
