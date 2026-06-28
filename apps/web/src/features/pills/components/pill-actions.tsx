"use client"

import { useState } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import {
  ExternalLinkIcon,
  RotateCwIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

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
import { useCloudflareVault } from "@/features/secrets/cloudflare-vault-provider"
import {
  deletePillFn,
  startPillFn,
  stopPillFn,
} from "@/features/pills/pill.functions"
import type { PillListItem } from "@/features/pills/types"

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

export function PillActions({
  pill,
  expiresAt,
}: {
  pill: PillListItem
  expiresAt?: string | null
}) {
  const router = useRouter()
  const { isUnlocked, requestUnlock } = useCloudflareVault()
  const startPill = useServerFn(startPillFn)
  const stopPill = useServerFn(stopPillFn)
  const deletePill = useServerFn(deletePillFn)
  const [pending, setPending] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const isRunning = Boolean(pill.activeRun)

  async function runStart() {
    setPending(true)
    try {
      await startPill({
        data: {
          pillId: pill.id,
          commandName: pill.defaultEnv,
          expiresAt: expiresAt ?? undefined,
          rotatePorts: false,
        },
      })
      await router.invalidate()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to start pill."))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {isRunning ? (
        <Button
          variant="destructive"
          onClick={async () => {
            setPending(true)
            try {
              await stopPill({
                data: {
                  pillId: pill.id,
                  runId: pill.activeRun?.id,
                },
              })
              await router.invalidate()
            } catch (err) {
              toast.error(getErrorMessage(err, "Failed to stop pill."))
            } finally {
              setPending(false)
            }
          }}
          disabled={pending}
        >
          <SquareIcon data-icon="inline-start" />
          Stop
        </Button>
      ) : (
        <Button
          onClick={() => {
            if (isUnlocked) {
              void runStart()
              return
            }

            requestUnlock({ onUnlocked: () => void runStart() })
          }}
          disabled={pending}
        >
          <RotateCwIcon data-icon="inline-start" />
          Start
        </Button>
      )}
      <Button
        variant="outline"
        render={<Link to="/pills/$pillId" params={{ pillId: pill.id }} />}
      >
        <ExternalLinkIcon data-icon="inline-start" />
        Details
      </Button>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogTrigger render={<Button variant="outline" />}>
          <Trash2Icon data-icon="inline-start" />
          Delete
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pill.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the pill, command profile, ports, runs, and local log
              records. When the Cloudflare vault is unlocked, its tunnel and DNS
              record are removed too; otherwise they are left in Cloudflare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending || isRunning}
              onClick={async () => {
                setPending(true)
                try {
                  const result = await deletePill({
                    data: {
                      pillId: pill.id,
                    },
                  })
                  if (result.cloudflareCleanup === "failed") {
                    toast.warning(
                      "Pill deleted, but its Cloudflare tunnel or DNS record may remain. Check your Cloudflare dashboard."
                    )
                  } else {
                    toast.success("Pill deleted.")
                  }
                  setDeleteOpen(false)
                  await router.invalidate()
                } catch (err) {
                  toast.error(getErrorMessage(err, "Failed to delete pill."))
                } finally {
                  setPending(false)
                }
              }}
            >
              Delete pill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
