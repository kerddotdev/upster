"use client"

import type { AccessScope } from "@upster/core"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useHasScopes } from "@/features/auth/use-scopes"

export function GatedButton({
  scopes,
  disabled,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { scopes: Array<AccessScope> }) {
  const allowed = useHasScopes(...scopes)

  if (allowed) {
    return (
      <Button disabled={disabled} {...props}>
        {children}
      </Button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Button {...props} disabled aria-disabled>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Requires {scopes.join(", ")}</TooltipContent>
    </Tooltip>
  )
}
