"use client"

import { useState } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import {
  ChevronDownIcon,
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
import { useErrorReporter } from "@/components/error-report"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCloudflareVault } from "@/features/secrets/cloudflare-vault-provider"
import {
  buildCapsuleFn,
  getCapsuleInfoFn,
} from "@/features/capsules/capsule.functions"
import {
  CapsuleDialog,
  type CapsuleBuildOptions,
} from "@/features/capsules/components/capsule-dialog"
import { DeployCapsuleDialog } from "@/features/capsules/components/deploy-capsule-dialog"
import { EditPillDialog } from "@/features/pills/components/edit-pill-dialog"
import {
  deletePillFn,
  startPillFn,
  stopPillFn,
} from "@/features/pills/pill.functions"
import { GatedButton } from "@/features/auth/gated-button"
import { useHasScopes } from "@/features/auth/use-scopes"
import type { PillDetail, PillListItem } from "@/features/pills/types"

type CapsuleAction = {
  confirmLabel: string
  run: (options: CapsuleBuildOptions) => Promise<void>
}

export function PillActions({
  pill,
  expiresAt,
  showDelete = true,
  showDetails = true,
  showEdit = false,
  editPill,
}: {
  pill: PillListItem
  expiresAt?: string | null
  showDelete?: boolean
  showDetails?: boolean
  showEdit?: boolean
  editPill?: PillDetail
}) {
  const router = useRouter()
  const reportError = useErrorReporter()
  const { isUnlocked, requestUnlock } = useCloudflareVault()
  const startPill = useServerFn(startPillFn)
  const stopPill = useServerFn(stopPillFn)
  const deletePill = useServerFn(deletePillFn)
  const buildCapsule = useServerFn(buildCapsuleFn)
  const getCapsuleInfo = useServerFn(getCapsuleInfoFn)
  const [pending, setPending] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [capsuleAction, setCapsuleAction] = useState<CapsuleAction | null>(null)
  const [deployCapsuleId, setDeployCapsuleId] = useState<string | null>(null)
  const canStart = useHasScopes("runs:start")
  const canStop = useHasScopes("runs:stop")
  const canDelete = useHasScopes("pills:delete")
  const isRunning = Boolean(pill.activeRun)

  function ensureUnlocked(action: () => void) {
    if (isUnlocked) {
      action()
      return
    }

    requestUnlock({ onUnlocked: action })
  }

  async function runStart(useCapsule: boolean) {
    setPending(true)
    try {
      await startPill({
        data: {
          pillId: pill.id,
          commandName: pill.defaultEnv,
          expiresAt: expiresAt ?? undefined,
          rotatePorts: false,
          useCapsule,
        },
      })
      await router.invalidate()
    } catch (err) {
      reportError(err, { fallback: "Failed to start pill.", pillId: pill.id })
    } finally {
      setPending(false)
    }
  }

  async function startCapsule() {
    setPending(true)
    try {
      const info = await getCapsuleInfo({ data: { pillId: pill.id } })
      const ready = info.capsules.find((capsule) => capsule.status === "ready")

      if (ready) {
        setDeployCapsuleId(ready.id)
        return
      }

      setCapsuleAction({
        confirmLabel: "Build and start",
        run: async (options) => {
          await buildCapsule({ data: { pillId: pill.id, ...options } })
          await startPill({
            data: {
              pillId: pill.id,
              commandName: pill.defaultEnv,
              expiresAt: expiresAt ?? undefined,
              rotatePorts: false,
              useCapsule: true,
            },
          })
          toast.success("Capsule built and started.")
          await router.invalidate()
        },
      })
    } catch (err) {
      reportError(err, {
        fallback: "Failed to start capsule.",
        pillId: pill.id,
      })
    } finally {
      setPending(false)
    }
  }

  function openRefreshDialog() {
    setCapsuleAction({
      confirmLabel: "Build capsule",
      run: async (options) => {
        await buildCapsule({ data: { pillId: pill.id, ...options } })
        toast.success("Capsule built.")
        await router.invalidate()
      },
    })
  }

  function openRefreshAndRestart() {
    setCapsuleAction({
      confirmLabel: "Refresh and restart",
      run: async (options) => {
        await buildCapsule({ data: { pillId: pill.id, ...options } })
        await stopPill({
          data: { pillId: pill.id, runId: pill.activeRun?.id },
        })
        try {
          await startPill({
            data: {
              pillId: pill.id,
              commandName: pill.defaultEnv,
              expiresAt: expiresAt ?? undefined,
              rotatePorts: false,
              useCapsule: true,
            },
          })
        } catch (error) {
          throw new Error(
            "Capsule rebuilt and the pill was stopped, but the restart failed. Start it manually.",
            { cause: error }
          )
        }
        toast.success("Capsule refreshed and restarted.")
        await router.invalidate()
      },
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {isRunning && pill.activeRun?.source ? (
        <Badge variant="outline" className="capitalize">
          {pill.activeRun.source}
        </Badge>
      ) : null}
      {isRunning ? (
        <div className="inline-flex">
          <GatedButton
            scopes={["runs:stop"]}
            variant="destructive"
            size="sm"
            className="rounded-r-none"
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
                reportError(err, {
                  fallback: "Failed to stop pill.",
                  pillId: pill.id,
                })
              } finally {
                setPending(false)
              }
            }}
            disabled={pending}
          >
            <SquareIcon data-icon="inline-start" />
            Stop
          </GatedButton>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="destructive"
                  size="icon-sm"
                  className="rounded-l-none border-l border-destructive/20"
                  disabled={pending || !canStop}
                  aria-label="More run options"
                />
              }
            >
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => ensureUnlocked(openRefreshAndRestart)}
              >
                Refresh capsule...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <div className="inline-flex">
          <GatedButton
            scopes={["runs:start"]}
            size="sm"
            className="rounded-r-none"
            onClick={() => ensureUnlocked(() => void runStart(false))}
            disabled={pending}
          >
            <RotateCwIcon data-icon="inline-start" />
            Start
          </GatedButton>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  className="rounded-l-none border-l border-primary-foreground/20 ring-0 outline-none focus:outline-none"
                  disabled={pending || !canStart}
                  aria-label="More start options"
                />
              }
            >
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => ensureUnlocked(() => void startCapsule())}
              >
                Start capsule
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openRefreshDialog}>
                Refresh capsule...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {showEdit && editPill ? <EditPillDialog pill={editPill} /> : null}
      {showDetails ? (
        <Button
          variant="ghost"
          size="sm"
          render={<Link to="/pills/$pillId" params={{ pillId: pill.id }} />}
        >
          <ExternalLinkIcon data-icon="inline-start" />
          Details
        </Button>
      ) : null}
      {showDelete && !canDelete ? (
        <GatedButton scopes={["pills:delete"]} variant="ghost" size="sm">
          <Trash2Icon data-icon="inline-start" />
          Delete
        </GatedButton>
      ) : null}
      {showDelete && canDelete && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
            <Trash2Icon data-icon="inline-start" />
            Delete
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {pill.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the pill, command profile, ports, runs, capsule
                copy, and local log records. When the Cloudflare Vault is
                unlocked, its tunnel and DNS record are removed too; otherwise
                they are left in Cloudflare.
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
                    reportError(err, {
                      fallback: "Failed to delete pill.",
                      pillId: pill.id,
                    })
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
      )}
      {capsuleAction ? (
        <CapsuleDialog
          pillId={pill.id}
          open={Boolean(capsuleAction)}
          onOpenChange={(open) => {
            if (!open) {
              setCapsuleAction(null)
            }
          }}
          confirmLabel={capsuleAction.confirmLabel}
          onConfirm={capsuleAction.run}
        />
      ) : null}
      {deployCapsuleId ? (
        <DeployCapsuleDialog
          pillId={pill.id}
          capsuleId={deployCapsuleId}
          commandName={pill.defaultEnv}
          slug={pill.slug}
          expiresAt={expiresAt}
          open={Boolean(deployCapsuleId)}
          onOpenChange={(open) => {
            if (!open) {
              setDeployCapsuleId(null)
            }
          }}
          onDeployed={() => router.invalidate()}
        />
      ) : null}
    </div>
  )
}
