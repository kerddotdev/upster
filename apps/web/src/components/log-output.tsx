"use client"

import { CopyIcon } from "lucide-react"
import { toast } from "sonner"

import { Mono } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function LogOutput({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const content = text || "No output captured."

  async function copy() {
    try {
      await navigator.clipboard.writeText(content)
      toast.success("Copied to clipboard.")
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Button
        size="icon-xs"
        variant="ghost"
        className="absolute top-1.5 right-1.5 z-10 text-muted-foreground"
        onClick={() => void copy()}
        aria-label="Copy output"
      >
        <CopyIcon />
      </Button>
      <div className="max-h-72 overflow-auto rounded-2xl bg-muted ring-1 ring-border">
        <pre className="p-3 pr-10 whitespace-pre-wrap" data-selectable>
          <Mono className="text-foreground">{content}</Mono>
        </pre>
      </div>
    </div>
  )
}
