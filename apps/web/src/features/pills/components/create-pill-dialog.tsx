"use client"

import { useState } from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { CreatePillForm } from "@/features/pills/components/create-pill-form"
import { GatedButton } from "@/features/auth/gated-button"
import { useHasScopes } from "@/features/auth/use-scopes"

export function CreatePillDialog() {
  const [open, setOpen] = useState(false)
  const canCreate = useHasScopes("pills:write")

  if (!canCreate) {
    return (
      <GatedButton scopes={["pills:write"]} size="sm">
        <PlusIcon data-icon="inline-start" />
        Add pill
      </GatedButton>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon data-icon="inline-start" />
        Add pill
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Upster pill</DialogTitle>
          <DialogDescription>
            Add a mounted repo and the command Upster should run.
          </DialogDescription>
        </DialogHeader>
        <CreatePillForm onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
