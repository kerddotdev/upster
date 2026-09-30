import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="upster-brand-bg" x1="0" y1="0" x2="0.6" y2="1">
          <stop stopColor="#d91d4e" />
          <stop offset="1" stopColor="#a91138" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="230" fill="url(#upster-brand-bg)" />
      <path
        fill="#ffe8ee"
        fillRule="evenodd"
        d="M222 832V478C222 302 340 192 512 192C684 192 802 302 802 478V832ZM384 832L450 562H350L512 370L674 562H574L640 832Z"
      />
    </svg>
  )
}
