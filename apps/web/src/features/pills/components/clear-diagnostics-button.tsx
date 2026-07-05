"use client"

import { useState } from "react"
import { useServerFn } from "@tanstack/react-start"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { useErrorReporter } from "@/components/error-report"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { clearPillDiagnosticsFn } from "@/features/pills/pill.functions"
import { GatedButton } from "@/features/auth/gated-button"
import { useHasScopes } from "@/features/auth/use-scopes"

export function ClearDiagnosticsButton({
  pillId,
  onCleared,
}: {
  pillId: string
  onCleared?: () => void
}) {
  const clearDiagnostics = useServerFn(clearPillDiagnosticsFn)
  const reportError = useErrorReporter()
  const canClear = useHasScopes("pills:delete")
  const [clearing, setClearing] = useState(false)

  if (!canClear) {
    return (
      <GatedButton scopes={["pills:delete"]} size="sm" variant="outline">
        <Trash2Icon data-icon="inline-start" />
        Clear diagnostics
      </GatedButton>
    )
  }

  async function clear() {
    setClearing(true)
    try {
      await clearDiagnostics({ data: { pillId } })
      toast.success("Diagnostics cleared.")
      onCleared?.()
    } catch (err) {
      reportError(err, { fallback: "Failed to clear diagnostics.", pillId })
    } finally {
      setClearing(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
        <Trash2Icon data-icon="inline-start" />
        Clear diagnostics
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear diagnostics?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes stopped run history, their logs, and failed capsule
            builds for this pill. The active run and successful snapshots are
            kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={clearing}
            onClick={() => void clear()}
          >
            Clear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
