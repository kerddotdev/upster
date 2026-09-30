import type { ReactElement, ReactNode } from "react"
import { CircleHelpIcon } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function Hint({
  label = "More information",
  children,
}: {
  label?: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        className="inline-grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <CircleHelpIcon className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent className="max-w-72 leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

export function Reason({
  reason,
  children,
}: {
  reason: string | false | undefined
  children: ReactElement
}) {
  if (!reason) return children
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="inline-flex rounded-4xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-64 leading-relaxed">
        {reason}
      </TooltipContent>
    </Tooltip>
  )
}
