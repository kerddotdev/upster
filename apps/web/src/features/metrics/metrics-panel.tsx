"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Skeleton } from "@/components/ui/skeleton"
import type { ParsedMetrics } from "@/features/metrics/parser"

type MetricsResponse =
  | { raw: string; parsed: ParsedMetrics }
  | { error: string }

export function useTunnelMetrics(runId: string | null, enabled = true) {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const lastErrorRef = useRef<string | null>(null)

  useEffect(() => {
    if (!runId || !enabled) {
      setMetrics(null)
      return
    }

    let cancelled = false

    async function loadMetrics() {
      let data: MetricsResponse

      try {
        const response = await fetch(`/api/runs/${runId}/metrics`)
        data = (await response.json()) as MetricsResponse
      } catch {
        data = { error: "Failed to load metrics." }
      }

      if (!cancelled) {
        setMetrics(data)

        if ("error" in data && data.error !== lastErrorRef.current) {
          lastErrorRef.current = data.error
          toast.error(data.error)
        }

        if (!("error" in data)) {
          lastErrorRef.current = null
        }
      }
    }

    void loadMetrics()
    const timer = setInterval(() => void loadMetrics(), 5000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [runId, enabled])

  return metrics
}

export function MetricsSummary({
  metrics,
}: {
  metrics: MetricsResponse | null
}) {
  const parsed = metrics && !("error" in metrics) ? metrics.parsed : null

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard
        label="HA connections"
        value={parsed?.haConnections ?? null}
      />
      <MetricCard
        label="Active streams"
        value={parsed?.activeStreams ?? null}
      />
      <MetricCard
        label="Total requests"
        value={parsed?.totalRequests ?? null}
      />
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4">
      <span className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="font-mono text-3xl font-semibold tabular-nums">
        {value ?? "-"}
      </span>
    </div>
  )
}

export function MetricsRaw({
  runId,
  metrics,
}: {
  runId: string | null
  metrics: MetricsResponse | null
}) {
  if (!runId) {
    return <p className="text-xs text-muted-foreground">No active run.</p>
  }

  if (!metrics) {
    return <Skeleton className="h-40 w-full" />
  }

  if ("error" in metrics) {
    return (
      <p className="text-xs text-muted-foreground">
        Metrics are not available for this run.
      </p>
    )
  }

  return (
    <pre className="max-h-[28rem] overflow-auto rounded-lg bg-muted p-3 text-xs">
      {metrics.raw}
    </pre>
  )
}
