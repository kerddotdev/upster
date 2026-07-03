"use client"

import { CopyIcon } from "lucide-react"
import { toast } from "sonner"

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
        size="icon-sm"
        variant="ghost"
        className="absolute top-1 right-1 z-10"
        onClick={() => void copy()}
        aria-label="Copy output"
      >
        <CopyIcon />
      </Button>
      <div className="max-h-72 overflow-auto rounded-md border border-border bg-muted/30">
        <pre className="p-2 pr-9 text-xs break-all whitespace-pre-wrap">
          {content}
        </pre>
      </div>
    </div>
  )
}
