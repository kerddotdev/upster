"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { EmptyState, StatCard } from "@/components/layout"
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
    <div className="grid gap-3 @sm:grid-cols-3">
      <StatCard
        label="HA connections"
        value={parsed?.haConnections ?? "-"}
        tone={(parsed?.haConnections ?? 0) > 0 ? "success" : undefined}
      />
      <StatCard label="Active streams" value={parsed?.activeStreams ?? "-"} />
      <StatCard label="Total requests" value={parsed?.totalRequests ?? "-"} />
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
    return <EmptyState>No active run.</EmptyState>
  }

  if (!metrics) {
    return <Skeleton className="h-40 w-full rounded-2xl" />
  }

  if ("error" in metrics) {
    return <EmptyState>Metrics are not available for this run.</EmptyState>
  }

  return (
    <pre className="max-h-[28rem] overflow-auto rounded-2xl bg-card p-4 font-mono text-[12px] leading-relaxed ring-1 ring-border">
      {metrics.raw}
    </pre>
  )
}
