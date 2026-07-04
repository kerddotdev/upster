"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useServerFn } from "@tanstack/react-start"
import {
  CheckIcon,
  DownloadIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FilesIcon,
  GitBranchIcon,
  PencilIcon,
  PinIcon,
  PlayIcon,
  RocketIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"

import { useErrorReporter } from "@/components/error-report"
import { LogOutput } from "@/components/log-output"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCloudflareVault } from "@/features/secrets/cloudflare-vault-provider"
import { CapsuleFileBrowser } from "@/features/capsules/components/capsule-file-browser"
import { DeployCapsuleDialog } from "@/features/capsules/components/deploy-capsule-dialog"
import {
  deleteCapsuleFn,
  getCapsuleInfoFn,
  pinCapsuleFn,
  relabelCapsuleFn,
} from "@/features/capsules/capsule.functions"
import type { Capsule, CapsuleInfo } from "@/features/capsules/types"
import { cn } from "@/lib/utils"

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
  slug,
  activeRun,
  expiresAt,
  allowBrowse = true,
  headerActions,
  onChanged,
}: {
  pillId: string
  commandName: string
  slug: string
  activeRun: { id: string; capsuleId: string | null } | null
  expiresAt?: string | null
  allowBrowse?: boolean
  headerActions?: ReactNode
  onChanged?: () => Promise<void> | void
}) {
  const { isUnlocked, requestUnlock } = useCloudflareVault()
  const reportError = useErrorReporter()
  const getInfo = useServerFn(getCapsuleInfoFn)
  const deleteCapsule = useServerFn(deleteCapsuleFn)
  const pinCapsule = useServerFn(pinCapsuleFn)
  const relabelCapsule = useServerFn(relabelCapsuleFn)

  const [info, setInfo] = useState<CapsuleInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [browseId, setBrowseId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [errorCapsule, setErrorCapsule] = useState<Capsule | null>(null)
  const [deployCapsule, setDeployCapsule] = useState<Capsule | null>(null)

  const load = useCallback(async () => {
    try {
      setInfo(await getInfo({ data: { pillId } }))
    } catch (err) {
      reportError(err, { fallback: "Failed to load capsules.", pillId })
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
    ensureUnlocked(() => setDeployCapsule(capsule))
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
      reportError(err, { fallback: "Failed to delete capsule.", pillId })
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
      reportError(err, { fallback: "Failed to update capsule.", pillId })
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
      reportError(err, { fallback: "Failed to rename capsule.", pillId })
    } finally {
      setBusy(null)
    }
  }

  if (!info) {
    return <Skeleton className="h-16 w-full" />
  }

  const running = Boolean(activeRun)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {info.capsules.length} snapshot
          {info.capsules.length === 1 ? "" : "s"} -{" "}
          {formatBytes(info.diskBytes)}
          {" on disk"}
        </span>
        {headerActions}
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
                className="flex flex-col gap-1 rounded-md border border-border p-2"
              >
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
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
                            onChange={(event) =>
                              setRenameValue(event.target.value)
                            }
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
                          className="flex items-center gap-2 text-xs font-medium hover:underline"
                          onClick={() => {
                            setRenaming(capsule.id)
                            setRenameValue(capsule.label ?? "")
                          }}
                        >
                          {capsule.label ?? capsule.id.slice(0, 8)}
                          <PencilIcon className="size-3 text-muted-foreground" />
                        </button>
                      )}
                      {deployed ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={<span className="inline-flex" />}
                          >
                            <RocketIcon className="size-3.5 text-primary" />
                          </TooltipTrigger>
                          <TooltipContent>Deployed</TooltipContent>
                        </Tooltip>
                      ) : null}
                      {capsule.pinned ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={<span className="inline-flex" />}
                          >
                            <PinIcon className="size-3.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>Pinned</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-4 text-[0.65rem] text-muted-foreground">
                      {capsule.git.commit ? (
                        <span className="inline-flex items-center gap-1">
                          <GitBranchIcon className="size-3" />
                          {capsule.git.branch ?? "?"}@
                          {capsule.git.commit.slice(0, 7)}
                          {capsule.git.dirty ? "*" : ""}
                        </span>
                      ) : null}
                      <span>
                        {formatBytes(capsule.sizeBytes)}
                        {capsule.builtAt
                          ? ` - ${new Date(capsule.builtAt).toLocaleString()}`
                          : ""}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {capsule.status === "error" ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => setErrorCapsule(capsule)}
                              aria-label="View build error"
                            />
                          }
                        >
                          <TriangleAlertIcon />
                        </TooltipTrigger>
                        <TooltipContent>Build failed</TooltipContent>
                      </Tooltip>
                    ) : null}
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
                        {capsule.previewHostname ? (
                          <DropdownMenuItem
                            render={
                              <a
                                href={`https://${capsule.previewHostname}`}
                                target="_blank"
                                rel="noreferrer"
                              />
                            }
                          >
                            <ExternalLinkIcon />
                            Open preview
                          </DropdownMenuItem>
                        ) : null}
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

                {allowBrowse && browseId === capsule.id ? (
                  <CapsuleFileBrowser capsuleId={capsule.id} />
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <Dialog
        open={Boolean(errorCapsule)}
        onOpenChange={(open) => {
          if (!open) {
            setErrorCapsule(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Build failed</DialogTitle>
            <DialogDescription>
              {errorCapsule?.error ?? "The capsule build did not complete."}
            </DialogDescription>
          </DialogHeader>
          {errorCapsule?.buildLog ? (
            <LogOutput text={errorCapsule.buildLog} />
          ) : null}
        </DialogContent>
      </Dialog>

      {deployCapsule ? (
        <DeployCapsuleDialog
          pillId={pillId}
          capsuleId={deployCapsule.id}
          commandName={commandName}
          slug={slug}
          expiresAt={expiresAt}
          open={Boolean(deployCapsule)}
          onOpenChange={(open) => {
            if (!open) {
              setDeployCapsule(null)
            }
          }}
          onDeployed={refresh}
        />
      ) : null}
    </div>
  )
}
