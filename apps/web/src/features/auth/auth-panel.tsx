import type { ReactNode } from "react"

import { BrandMark } from "@/components/brand-mark"

export function AuthPanel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col items-center justify-center gap-8 px-4 pt-[calc(var(--toolbar-height)+16px)] pb-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandMark className="size-12" />
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-[26px] leading-tight font-medium tracking-[-0.02em]">
            {title}
          </h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex w-full flex-col gap-4 rounded-3xl bg-card p-6 ring-1 ring-border">
        {children}
      </div>
    </main>
  )
}
