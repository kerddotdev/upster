"use client"

import { useMemo } from "react"
import { renderSVG } from "uqr"

import { cn } from "@/lib/utils"

export function QrCode({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const svg = useMemo(
    () =>
      renderSVG(value, {
        border: 2,
        pixelSize: 6,
        whiteColor: "white",
        blackColor: "black",
      }),
    [value]
  )

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md bg-white p-2 [&_svg]:h-auto [&_svg]:w-full",
        className
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
