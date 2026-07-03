"use client"

import { useEffect, useState } from "react"
import { useServerFn } from "@tanstack/react-start"
import { PackageIcon } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { getCapsuleInfoFn } from "@/features/capsules/capsule.functions"
import type { CapsuleInfo } from "@/features/capsules/types"

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

export type CapsuleBuildOptions = {
  includeNodeModules: boolean
  installDeps: boolean
  label?: string
}

export function CapsuleDialog({
  pillId,
  open,
  onOpenChange,
  confirmLabel,
  onConfirm,
}: {
  pillId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  confirmLabel: string
  onConfirm: (options: CapsuleBuildOptions) => Promise<void>
}) {
  const getInfo = useServerFn(getCapsuleInfoFn)
  const [info, setInfo] = useState<CapsuleInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [includeNodeModules, setIncludeNodeModules] = useState(false)
  const [installDeps, setInstallDeps] = useState(false)
  const [label, setLabel] = useState("")

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    setLoading(true)
    setInfo(null)
    setLabel("")

    getInfo({ data: { pillId } })
      .then((result) => {
        if (cancelled) {
          return
        }

        setInfo(result)
        setIncludeNodeModules(result.source.hasNodeModules)
        setInstallDeps(
          !result.source.hasNodeModules && result.source.supportsInstall
        )
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(getErrorMessage(err, "Failed to load capsule info."))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, pillId, getInfo])

  const supportsInstall = info?.source.supportsInstall ?? false
  const detectedManager = info?.source.detectedManager ?? null
  const readyCount =
    info?.capsules.filter((capsule) => capsule.status === "ready").length ?? 0

  async function confirm() {
    setPending(true)
    try {
      await onConfirm({
        includeNodeModules,
        installDeps: installDeps && supportsInstall,
        label: label.trim() || undefined,
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to build capsule."))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <PackageIcon data-icon="inline-start" />
            Capsule
          </DialogTitle>
          <DialogDescription>
            Freeze the current source into an isolated snapshot and deploy from
            it, so live edits on disk do not affect the running deployment.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {readyCount > 0
                ? `${readyCount} snapshot${readyCount === 1 ? "" : "s"} stored.`
                : "No snapshots yet."}
            </p>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Label (optional)</span>
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. demo build"
              />
            </label>

            <label className="flex items-center justify-between gap-4">
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">
                  Copy node_modules from source
                </span>
                <span className="text-xs text-muted-foreground">
                  {info?.source.hasNodeModules
                    ? "Source has node_modules."
                    : "Source has no node_modules."}
                </span>
              </span>
              <Switch
                checked={includeNodeModules}
                onCheckedChange={setIncludeNodeModules}
              />
            </label>

            <label className="flex items-center justify-between gap-4">
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">
                  Install dependencies
                </span>
                <span className="text-xs text-muted-foreground">
                  {supportsInstall
                    ? `Detected: ${detectedManager}`
                    : "Not supported (no package.json)."}
                </span>
              </span>
              <Switch
                checked={installDeps && supportsInstall}
                onCheckedChange={setInstallDeps}
                disabled={!supportsInstall}
              />
            </label>
          </div>
        )}

        <DialogFooter showCloseButton>
          <Button onClick={() => void confirm()} disabled={pending || loading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
