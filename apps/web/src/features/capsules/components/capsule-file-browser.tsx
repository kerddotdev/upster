"use client"

import { useEffect, useState } from "react"
import { useServerFn } from "@tanstack/react-start"
import { ChevronRightIcon, FileIcon, FolderIcon } from "lucide-react"

import { useErrorReporter } from "@/components/error-report"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Mono } from "@/components/layout"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  capsuleDirFn,
  capsuleFileFn,
} from "@/features/capsules/capsule.functions"
import type {
  CapsuleFilePreview,
  CapsuleTreeEntry,
} from "@/features/capsules/types"
import { cn } from "@/lib/utils"

function formatBytes(bytes: number | null) {
  if (bytes === null) {
    return ""
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function DirContents({
  capsuleId,
  path,
  depth,
  selectedPath,
  onSelectFile,
}: {
  capsuleId: string
  path: string
  depth: number
  selectedPath: string | null
  onSelectFile: (entry: CapsuleTreeEntry) => void
}) {
  const listDir = useServerFn(capsuleDirFn)
  const reportError = useErrorReporter()
  const [entries, setEntries] = useState<Array<CapsuleTreeEntry> | null>(null)
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    listDir({ data: { capsuleId, path } })
      .then((result) => {
        if (!cancelled) {
          setEntries(result.entries)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          reportError(err, { fallback: "Failed to read directory." })
        }
      })
    return () => {
      cancelled = true
    }
  }, [capsuleId, path, listDir])

  if (entries === null) {
    return (
      <p
        className="py-1 text-xs text-muted-foreground"
        style={{ paddingLeft: depth * 14 + 8 }}
      >
        Loading...
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {entries.map((entry) =>
        entry.type === "dir" ? (
          <Collapsible
            key={entry.path}
            open={openDirs[entry.path] ?? false}
            onOpenChange={(open) =>
              setOpenDirs((prev) => ({ ...prev, [entry.path]: open }))
            }
          >
            <CollapsibleTrigger
              className="flex w-full items-center gap-1 rounded-md py-1 text-left text-xs hover:bg-muted"
              style={{ paddingLeft: depth * 14 + 4 }}
            >
              <ChevronRightIcon
                className={cn(
                  "size-3 shrink-0 transition-transform",
                  (openDirs[entry.path] ?? false) && "rotate-90"
                )}
              />
              <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{entry.name}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {(openDirs[entry.path] ?? false) ? (
                <DirContents
                  capsuleId={capsuleId}
                  path={entry.path}
                  depth={depth + 1}
                  selectedPath={selectedPath}
                  onSelectFile={onSelectFile}
                />
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <button
            key={entry.path}
            type="button"
            onClick={() => onSelectFile(entry)}
            className={cn(
              "flex w-full items-center gap-1 rounded-md py-1 text-left text-xs hover:bg-muted",
              selectedPath === entry.path && "bg-muted"
            )}
            style={{ paddingLeft: depth * 14 + 20 }}
          >
            <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{entry.name}</span>
            <span className="ml-auto pr-2 text-[0.625rem] text-muted-foreground">
              {formatBytes(entry.size)}
            </span>
          </button>
        )
      )}
      {entries.length === 0 ? (
        <p
          className="py-1 text-xs text-muted-foreground"
          style={{ paddingLeft: depth * 14 + 20 }}
        >
          Empty
        </p>
      ) : null}
    </div>
  )
}

export function CapsuleFileBrowser({ capsuleId }: { capsuleId: string }) {
  const readFile = useServerFn(capsuleFileFn)
  const reportError = useErrorReporter()
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<CapsuleFilePreview | null>(null)
  const [loading, setLoading] = useState(false)

  async function selectFile(entry: CapsuleTreeEntry) {
    setSelected(entry.path)
    setLoading(true)
    setPreview(null)
    try {
      setPreview(await readFile({ data: { capsuleId, path: entry.path } }))
    } catch (err) {
      reportError(err, { fallback: "Failed to read file." })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ScrollArea className="h-80 rounded-2xl bg-background ring-1 ring-border">
        <div className="p-1">
          <DirContents
            capsuleId={capsuleId}
            path=""
            depth={0}
            selectedPath={selected}
            onSelectFile={selectFile}
          />
        </div>
      </ScrollArea>
      <div className="flex h-80 flex-col overflow-hidden rounded-2xl bg-background ring-1 ring-border">
        {selected ? (
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
            <Mono className="truncate">{selected}</Mono>
            {preview ? (
              <span className="shrink-0 text-muted-foreground">
                {formatBytes(preview.size)}
                {preview.truncated ? " (truncated)" : ""}
              </span>
            ) : null}
          </div>
        ) : null}
        <ScrollArea className="min-h-0 flex-1">
          {loading ? (
            <p className="p-3 text-xs text-muted-foreground">Loading...</p>
          ) : !selected ? (
            <p className="p-3 text-xs text-muted-foreground">
              Select a file to preview.
            </p>
          ) : preview?.binary ? (
            <p className="p-3 text-xs text-muted-foreground">
              Binary file - preview not available.
            </p>
          ) : (
            <pre className="p-3 font-mono text-[12px] break-all whitespace-pre-wrap">
              {preview?.content}
            </pre>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
