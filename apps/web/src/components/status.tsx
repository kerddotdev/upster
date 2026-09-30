import {
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  CircleXIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

export const tones = {
  running: { icon: CircleDotIcon, className: "text-running bg-running/12" },
  attention: {
    icon: TriangleAlertIcon,
    className: "text-attention bg-attention/12",
  },
  success: { icon: CircleCheckIcon, className: "text-success bg-success/12" },
  danger: { icon: CircleXIcon, className: "text-danger bg-danger/12" },
  idle: { icon: CircleIcon, className: "text-neutral bg-neutral/12" },
  progress: {
    icon: LoaderCircleIcon,
    className: "text-attention bg-attention/12",
  },
} as const satisfies Record<string, { icon: LucideIcon; className: string }>

export type Tone = keyof typeof tones

export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: Tone
  label: string
  className?: string
}) {
  const { icon: Icon, className: toneClassName } = tones[tone]
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full pr-2.5 pl-2 text-xs font-medium whitespace-nowrap",
        toneClassName,
        className
      )}
    >
      <Icon
        className={cn("size-3.5", tone === "progress" && "animate-spin")}
        aria-hidden
      />
      {label}
    </span>
  )
}

export function StatusText({ tone, label }: { tone: Tone; label: string }) {
  const { icon: Icon, className } = tones[tone]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        className
          .split(" ")
          .filter((name) => name.startsWith("text-"))
          .join(" ")
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  )
}

export function StatusDot({
  tone,
  className,
}: {
  tone: Tone
  className?: string
}) {
  const dot: Record<Tone, string> = {
    running: "bg-running",
    attention: "bg-attention",
    success: "bg-success",
    danger: "bg-danger",
    idle: "bg-neutral",
    progress: "bg-attention",
  }
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", dot[tone], className)}
    />
  )
}
