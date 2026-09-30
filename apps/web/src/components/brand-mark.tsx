import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="64" height="64" rx="15" className="fill-brand-fill" />
      <path
        d="M17 47V33a15 15 0 0 1 30 0v14"
        fill="none"
        stroke="var(--upster-on-brand)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M32 44V26m-7 7 7-7 7 7"
        fill="none"
        stroke="var(--upster-on-brand)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
