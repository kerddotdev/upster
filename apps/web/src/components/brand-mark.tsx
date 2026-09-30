import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="1024" height="1024" rx="230" fill="#f6d6df" />
      <path
        fill="#c8143f"
        fillRule="evenodd"
        d="M222 832V478C222 302 340 192 512 192C684 192 802 302 802 478V832ZM384 832L450 562H350L512 370L674 562H574L640 832Z"
      />
    </svg>
  )
}
