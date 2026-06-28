"use client"

import { LockIcon, LockOpenIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCloudflareVault } from "@/features/secrets/cloudflare-vault-provider"

export function CloudflareLockButton({ className }: { className?: string }) {
  const { isUnlocked, requestUnlock, lock } = useCloudflareVault()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={isUnlocked ? "secondary" : "outline"}
            size="sm"
            className={className}
            onClick={() => {
              if (isUnlocked) {
                void lock()
                return
              }

              requestUnlock()
            }}
          />
        }
      >
        {isUnlocked ? (
          <LockOpenIcon data-icon="inline-start" />
        ) : (
          <LockIcon data-icon="inline-start" />
        )}
        {isUnlocked ? "Unlocked" : "Locked"}
      </TooltipTrigger>
      <TooltipContent>
        {isUnlocked
          ? "Cloudflare vault is unlocked. Click to lock."
          : "Cloudflare vault is locked. Click to unlock."}
      </TooltipContent>
    </Tooltip>
  )
}
