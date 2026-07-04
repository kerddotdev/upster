"use client"

import { useState } from "react"
import { useServerFn } from "@tanstack/react-start"
import { PackagePlusIcon } from "lucide-react"
import { toast } from "sonner"

import { useErrorReporter } from "@/components/error-report"
import { Button } from "@/components/ui/button"
import {
  CapsuleDialog,
  type CapsuleBuildOptions,
} from "@/features/capsules/components/capsule-dialog"
import {
  buildCapsuleFn,
  prunePillCapsulesFn,
} from "@/features/capsules/capsule.functions"

export function CapsuleActions({
  pillId,
  onChanged,
}: {
  pillId: string
  onChanged?: () => Promise<void> | void
}) {
  const buildCapsule = useServerFn(buildCapsuleFn)
  const prunePill = useServerFn(prunePillCapsulesFn)
  const reportError = useErrorReporter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pruning, setPruning] = useState(false)

  const buildConfirm = async (options: CapsuleBuildOptions) => {
    await buildCapsule({ data: { pillId, ...options } })
    toast.success("Capsule built.")
    await onChanged?.()
  }

  async function prune() {
    setPruning(true)
    try {
      await prunePill({ data: { pillId } })
      toast.success("Pruned old snapshots.")
      await onChanged?.()
    } catch (err) {
      reportError(err, { fallback: "Failed to prune.", pillId })
    } finally {
      setPruning(false)
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
        <PackagePlusIcon data-icon="inline-start" />
        Build snapshot
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void prune()}
        disabled={pruning}
      >
        Prune
      </Button>
      <CapsuleDialog
        pillId={pillId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        confirmLabel="Build snapshot"
        onConfirm={buildConfirm}
      />
    </div>
  )
}
