"use client"

import { useState } from "react"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"

import { useErrorReporter } from "@/components/error-report"
import { Mono } from "@/components/layout"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useCloudflareVault } from "@/features/secrets/cloudflare-vault-provider"
import { startPillFn } from "@/features/pills/pill.functions"
import type { PillDeployTarget } from "@/features/pills/types"
import { cn } from "@/lib/utils"

export function DeployCapsuleDialog({
  pillId,
  capsuleId,
  commandName,
  slug,
  expiresAt,
  open,
  onOpenChange,
  onDeployed,
}: {
  pillId: string
  capsuleId: string
  commandName: string
  slug: string
  expiresAt?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeployed?: () => Promise<void> | void
}) {
  const startPill = useServerFn(startPillFn)
  const reportError = useErrorReporter()
  const { rootDomain } = useCloudflareVault()
  const [target, setTarget] = useState<PillDeployTarget>("production")
  const [pending, setPending] = useState(false)

  const shortId = capsuleId.slice(0, 8)
  const productionHost = rootDomain
    ? `${slug}.${rootDomain}`
    : "the main hostname"
  const previewHost = rootDomain
    ? `${slug}-${shortId}.${rootDomain}`
    : "a per-snapshot hostname"

  async function deploy() {
    setPending(true)
    try {
      await startPill({
        data: {
          pillId,
          commandName,
          useCapsule: true,
          capsuleId,
          deployTarget: target,
          expiresAt: expiresAt ?? undefined,
          rotatePorts: false,
        },
      })
      toast.success(
        target === "preview"
          ? "Deployed to preview."
          : "Deployed to production."
      )
      onOpenChange(false)
      await onDeployed?.()
    } catch (err) {
      reportError(err, { fallback: "Failed to deploy snapshot.", pillId })
    } finally {
      setPending(false)
    }
  }

  const options: Array<{
    value: PillDeployTarget
    title: string
    host: string
  }> = [
    { value: "production", title: "Production", host: productionHost },
    { value: "preview", title: "Preview", host: previewHost },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deploy snapshot</DialogTitle>
          <DialogDescription>
            Choose where this snapshot should be served.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={target}
          onValueChange={(value) => setTarget(value as PillDeployTarget)}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTarget(option.value)}
              className={cn(
                "flex items-start gap-3 rounded-2xl px-4 py-3 text-left ring-1 ring-border transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60",
                target === option.value && "bg-brand-soft ring-brand/40"
              )}
            >
              <RadioGroupItem value={option.value} className="mt-0.5" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{option.title}</span>
                <Mono>{option.host}</Mono>
              </span>
            </button>
          ))}
        </RadioGroup>

        <DialogFooter showCloseButton>
          <Button onClick={() => void deploy()} disabled={pending}>
            Deploy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
