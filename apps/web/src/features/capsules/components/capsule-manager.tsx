"use client"

import { useCallback, useEffect, useState } from "react"
import { useServerFn } from "@tanstack/react-start"
import {
  CheckIcon,
  DownloadIcon,
  EllipsisIcon,
  FilesIcon,
  GitBranchIcon,
  PackagePlusIcon,
  PencilIcon,
  PinIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useCloudflareVault } from "@/features/secrets/cloudflare-vault-provider"
import {
  CapsuleDialog,
  type CapsuleBuildOptions,
} from "@/features/capsules/components/capsule-dialog"
import { CapsuleFileBrowser } from "@/features/capsules/components/capsule-file-browser"
import {
  buildCapsuleFn,
  deleteCapsuleFn,
  getCapsuleInfoFn,
  pinCapsuleFn,
  prunePillCapsulesFn,
  relabelCapsuleFn,
} from "@/features/capsules/capsule.functions"
import { startPillFn } from "@/features/pills/pill.functions"
import type { Capsule, CapsuleInfo } from "@/features/capsules/types"
import { cn } from "@/lib/utils"

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

function formatBytes(bytes: number | null) {
  if (bytes === null) {
    return "-"
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const statusDot: Record<Capsule["status"], string> = {
  ready: "bg-emerald-500",
  building: "bg-amber-500 animate-pulse",
  error: "bg-destructive",
}

export function CapsuleManager({
  pillId,
  commandName,
  activeRun,
  allowBrowse = true,
  onChanged,
}: {
  pillId: string
  commandName: string
  activeRun: { id: string; capsuleId: string | null } | null
  allowBrowse?: boolean
  onChanged?: () => Promise<void> | void
}) {
  const { isUnlocked, requestUnlock } = useCloudflareVault()
  const getInfo = useServerFn(getCapsuleInfoFn)
  const buildCapsule = useServerFn(buildCapsuleFn)
  const deleteCapsule = useServerFn(deleteCapsuleFn)
  const pinCapsule = useServerFn(pinCapsuleFn)
  const relabelCapsule = useServerFn(relabelCapsuleFn)
  const prunePill = useServerFn(prunePillCapsulesFn)
  const startPill = useServerFn(startPillFn)

  const [info, setInfo] = useState<CapsuleInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [browseId, setBrowseId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  const load = useCallback(async () => {
    try {
      setInfo(await getInfo({ data: { pillId } }))
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load capsules."))
    }
  }, [getInfo, pillId])

  useEffect(() => {
    void load()
  }, [load])

  async function refresh() {
    await load()
    await onChanged?.()
  }

  function ensureUnlocked(action: () => void) {
    if (isUnlocked) {
      action()
      return
    }
    requestUnlock({ onUnlocked: action })
  }

  function startVersion(capsule: Capsule) {
    ensureUnlocked(async () => {
      setBusy(capsule.id)
      try {
        await startPill({
          data: {
            pillId,
            commandName,
            useCapsule: true,
            capsuleId: capsule.id,
          },
        })
        await refresh()
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to start capsule."))
      } finally {
        setBusy(null)
      }
    })
  }

  async function removeVersion(capsule: Capsule) {
    setBusy(capsule.id)
    try {
      await deleteCapsule({ data: { capsuleId: capsule.id } })
      if (browseId === capsule.id) {
        setBrowseId(null)
      }
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete capsule."))
    } finally {
      setBusy(null)
    }
  }

  async function togglePin(capsule: Capsule) {
    setBusy(capsule.id)
    try {
      await pinCapsule({
        data: { capsuleId: capsule.id, pinned: !capsule.pinned },
      })
      await load()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update capsule."))
    } finally {
      setBusy(null)
    }
  }

  async function saveRename(capsule: Capsule) {
    setBusy(capsule.id)
    try {
      await relabelCapsule({
        data: { capsuleId: capsule.id, label: renameValue.trim() || null },
      })
      setRenaming(null)
      await load()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to rename capsule."))
    } finally {
      setBusy(null)
    }
  }

  async function prune() {
    setBusy("prune")
    try {
      await prunePill({ data: { pillId } })
      toast.success("Pruned old snapshots.")
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to prune."))
    } finally {
      setBusy(null)
    }
  }

  function openBuild() {
    ensureUnlocked(() => setDialogOpen(true))
  }

  const buildConfirm = async (options: CapsuleBuildOptions) => {
    await buildCapsule({ data: { pillId, ...options } })
    toast.success("Capsule built.")
    await refresh()
  }

  if (!info) {
    return <Skeleton className="h-16 w-full" />
  }

  const running = Boolean(activeRun)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {info.capsules.length} snapshot
          {info.capsules.length === 1 ? "" : "s"} -{" "}
          {formatBytes(info.diskBytes)}
          {" on disk"}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={openBuild}>
            <PackagePlusIcon data-icon="inline-start" />
            Build snapshot
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void prune()}
            disabled={busy === "prune" || info.capsules.length === 0}
          >
            Prune
          </Button>
        </div>
      </div>

      {info.capsules.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No snapshots yet. Build one to deploy a frozen copy of the source.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {info.capsules.map((capsule) => {
            const deployed = activeRun?.capsuleId === capsule.id
            const isBusy = busy === capsule.id

            return (
              <div
                key={capsule.id}
                className="flex flex-col gap-2 rounded-md border border-border p-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      statusDot[capsule.status]
                    )}
                  />
                  {renaming === capsule.id ? (
                    <span className="flex items-center gap-1">
                      <Input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        className="h-6 w-40"
                        placeholder="Label"
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void saveRename(capsule)}
                        disabled={isBusy}
                      >
                        <CheckIcon />
                      </Button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs font-medium hover:underline"
                      onClick={() => {
                        setRenaming(capsule.id)
                        setRenameValue(capsule.label ?? "")
                      }}
                    >
                      {capsule.label ?? capsule.id.slice(0, 8)}
                      <PencilIcon className="size-3 text-muted-foreground" />
                    </button>
                  )}
                  {deployed ? <Badge variant="default">deployed</Badge> : null}
                  {capsule.pinned ? (
                    <Badge variant="outline">pinned</Badge>
                  ) : null}
                  {capsule.git.commit ? (
                    <span className="inline-flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                      <GitBranchIcon className="size-3" />
                      {capsule.git.branch ?? "?"}@
                      {capsule.git.commit.slice(0, 7)}
                      {capsule.git.dirty ? "*" : ""}
                    </span>
                  ) : null}
                  <span className="text-[0.65rem] text-muted-foreground">
                    {formatBytes(capsule.sizeBytes)}
                    {capsule.builtAt
                      ? ` - ${new Date(capsule.builtAt).toLocaleString()}`
                      : ""}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant={deployed ? "secondary" : "default"}
                      onClick={() => startVersion(capsule)}
                      disabled={isBusy || running || capsule.status !== "ready"}
                    >
                      <PlayIcon data-icon="inline-start" />
                      {deployed ? "Deployed" : "Start"}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="More snapshot actions"
                          />
                        }
                      >
                        <EllipsisIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => void togglePin(capsule)}
                        >
                          <PinIcon />
                          {capsule.pinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                        {allowBrowse ? (
                          <DropdownMenuItem
                            disabled={capsule.status !== "ready"}
                            onClick={() =>
                              setBrowseId(
                                browseId === capsule.id ? null : capsule.id
                              )
                            }
                          >
                            <FilesIcon />
                            {browseId === capsule.id ? "Hide files" : "Files"}
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          render={
                            <a
                              href={`/api/capsules/${capsule.id}/archive`}
                              download
                            />
                          }
                        >
                          <DownloadIcon />
                          Export
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={isBusy || deployed}
                          onClick={() => void removeVersion(capsule)}
                        >
                          <Trash2Icon />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {capsule.status === "error" && capsule.error ? (
                  <p className="text-[0.65rem] text-destructive">
                    {capsule.error}
                  </p>
                ) : null}

                {allowBrowse && browseId === capsule.id ? (
                  <CapsuleFileBrowser capsuleId={capsule.id} />
                ) : null}
              </div>
            )
          })}
        </div>
      )}

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
