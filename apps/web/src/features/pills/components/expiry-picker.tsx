"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { CalendarClockIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

function formatLocalTime(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")

  return `${hours}:${minutes}`
}

function parseIsoDate(value: string | null) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoString(date: Date | undefined, time: string) {
  if (!date) {
    return null
  }

  const [hoursRaw, minutesRaw] = time.split(":")
  const next = new Date(date)
  next.setHours(Number(hoursRaw ?? 23), Number(minutesRaw ?? 59), 0, 0)

  return next.toISOString()
}

export function ExpiryPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
}) {
  const parsedDate = useMemo(() => parseIsoDate(value), [value])
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState(() =>
    parsedDate ? formatLocalTime(parsedDate) : "23:59"
  )
  const label = parsedDate
    ? `${format(parsedDate, "PP")} ${formatLocalTime(parsedDate)}`
    : "No expiry"

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="secondary"
              size="sm"
              className="justify-start font-normal"
              disabled={disabled}
            />
          }
        >
          <CalendarClockIcon data-icon="inline-start" />
          {label}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 overflow-visible p-0">
          <FieldGroup className="gap-0 rounded-lg bg-popover">
            <Calendar
              className="mx-auto w-full bg-transparent"
              mode="single"
              selected={parsedDate ?? undefined}
              defaultMonth={parsedDate ?? undefined}
              disabled={{ before: new Date() }}
              onSelect={(date) => {
                onChange(toIsoString(date, time))
              }}
            />
            <Field className="mx-auto w-full px-3 pb-3">
              <FieldLabel htmlFor="expiry-time">Time</FieldLabel>
              <Input
                id="expiry-time"
                type="time"
                step="60"
                value={time}
                className="w-full appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                onChange={(event) => {
                  const nextTime = event.target.value
                  setTime(nextTime)
                  onChange(toIsoString(parsedDate ?? undefined, nextTime))
                }}
              />
            </Field>
          </FieldGroup>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn("text-muted-foreground", !value && "hidden")}
        onClick={() => onChange(null)}
        disabled={disabled || !value}
        aria-label="Clear expiry"
      >
        <XIcon />
      </Button>
    </div>
  )
}
