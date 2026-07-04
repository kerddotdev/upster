"use client"

import { useCallback, useEffect, useState } from "react"
import { useServerFn } from "@tanstack/react-start"
import { ChevronRightIcon } from "lucide-react"
import { toast } from "sonner"

import { LogOutput } from "@/components/log-output"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getPillDiagnosticsFn,
  getRunLogsFn,
} from "@/features/pills/pill.functions"
import type { Capsule } from "@/features/capsules/types"
import type { PillRun, RunLog } from "@/features/pills/types"
import { cn } from "@/lib/utils"

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

type Diagnostics = {
  runs: Array<PillRun>
  capsuleErrors: Array<Capsule>
}

function RunRow({ run }: { run: PillRun }) {
  const getRunLogs = useServerFn(getRunLogsFn)
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<Array<RunLog> | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && logs === null) {
      setLoading(true)
      try {
        setLogs(await getRunLogs({ data: { runId: run.id } }))
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to load run logs."))
      } finally {
        setLoading(false)
      }
    }
  }

  const failed = run.status === "error"

  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={failed ? "destructive" : "outline"}>{run.status}</Badge>
        {run.source ? (
          <Badge variant="outline" className="capitalize">
            {run.source}
          </Badge>
        ) : null}
        <span className="text-xs font-medium">{run.commandName}</span>
        <span className="text-[0.65rem] text-muted-foreground">
          {new Date(run.startedAt).toLocaleString()}
          {run.exitCode !== null ? ` - exit ${run.exitCode}` : ""}
        </span>
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto"
          onClick={() => void toggle()}
        >
          <ChevronRightIcon
            className={cn("transition-transform", open && "rotate-90")}
          />
          Logs
        </Button>
      </div>
      {run.error && !open ? (
        <p className="mt-1 text-xs text-destructive">{run.error}</p>
      ) : null}
      {open ? (
        loading ? (
          <Skeleton className="mt-3 h-16 w-full" />
        ) : (
          <LogOutput
            className="mt-3"
            text={(logs ?? [])
              .map((entry) => entry.chunk)
              .join("")
              .trim()}
          />
        )
      ) : null}
    </div>
  )
}

function CapsuleErrorRow({ capsule }: { capsule: Capsule }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">build failed</Badge>
        <span className="text-xs font-medium">
          {capsule.label ?? capsule.id.slice(0, 8)}
        </span>
        <span className="text-[0.65rem] text-muted-foreground">
          {new Date(capsule.createdAt).toLocaleString()}
        </span>
        {capsule.buildLog ? (
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto"
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronRightIcon
              className={cn("transition-transform", open && "rotate-90")}
            />
            Build log
          </Button>
        ) : null}
      </div>
      {capsule.error && !open ? (
        <p className="mt-1 text-xs text-destructive">{capsule.error}</p>
      ) : null}
      {open && capsule.buildLog ? (
        <LogOutput className="mt-3" text={capsule.buildLog} />
      ) : null}
    </div>
  )
}

export function PillDiagnostics({ pillId }: { pillId: string }) {
  const getDiagnostics = useServerFn(getPillDiagnosticsFn)
  const [data, setData] = useState<Diagnostics | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await getDiagnostics({ data: { pillId } }))
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load diagnostics."))
    }
  }, [getDiagnostics, pillId])

  useEffect(() => {
    void load()
  }, [load])

  if (!data) {
    return <Skeleton className="h-24 w-full" />
  }

  return (
    <div className="flex flex-col gap-4">
      {data.capsuleErrors.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            Capsule build failures
          </h3>
          {data.capsuleErrors.map((capsule) => (
            <CapsuleErrorRow key={capsule.id} capsule={capsule} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          Recent runs
        </h3>
        {data.runs.length ? (
          data.runs.map((run) => <RunRow key={run.id} run={run} />)
        ) : (
          <p className="text-xs text-muted-foreground">No runs yet.</p>
        )}
      </div>
    </div>
  )
}
