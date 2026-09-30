"use client"

import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { PencilIcon } from "lucide-react"
import { toast } from "sonner"

import { useErrorReporter } from "@/components/error-report"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { updatePillFn } from "@/features/pills/pill.functions"
import { GatedButton } from "@/features/auth/gated-button"
import { useHasScopes } from "@/features/auth/use-scopes"
import type { PillDetail } from "@/features/pills/types"

function quoteArg(arg: string) {
  if (/[\s"']/.test(arg)) {
    return `'${arg.replace(/'/g, "'\\''")}'`
  }
  return arg
}

function commandToString(argv: Array<string>) {
  return argv.map(quoteArg).join(" ")
}

function envToText(env: Record<string, string>) {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
}

function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) {
      continue
    }
    const index = trimmed.indexOf("=")
    if (index === -1) {
      continue
    }
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1)
  }
  return env
}

export function EditPillDialog({ pill }: { pill: PillDetail }) {
  const router = useRouter()
  const reportError = useErrorReporter()
  const updatePill = useServerFn(updatePillFn)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const canEdit = useHasScopes("pills:write")

  const command =
    pill.commands.find((entry) => entry.name === pill.defaultEnv) ??
    pill.commands[0]

  if (!canEdit) {
    return (
      <GatedButton scopes={["pills:write"]} variant="ghost" size="sm">
        <PencilIcon data-icon="inline-start" />
        Edit
      </GatedButton>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <PencilIcon data-icon="inline-start" />
        Edit
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {pill.name}</DialogTitle>
          <DialogDescription>
            Update the name, command, and environment. The repository path and
            subdomain slug are fixed.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            setPending(true)
            try {
              const commandName = String(form.get("commandName") ?? "").trim()
              await updatePill({
                data: {
                  pillId: pill.id,
                  name: String(form.get("name") ?? "").trim(),
                  defaultEnv: commandName,
                  commandName,
                  command: String(form.get("command") ?? "").trim(),
                  cwd: String(form.get("cwd") ?? "").trim() || undefined,
                  env: parseEnvText(String(form.get("env") ?? "")),
                  healthcheckPath:
                    String(form.get("healthcheckPath") ?? "").trim() || null,
                },
              })
              toast.success("Pill updated.")
              setOpen(false)
              await router.invalidate()
            } catch (err) {
              reportError(err, {
                fallback: "Failed to update pill.",
                pillId: pill.id,
              })
            } finally {
              setPending(false)
            }
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="edit-name">Name</FieldLabel>
              <Input
                id="edit-name"
                name="name"
                defaultValue={pill.name}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-repo-path">
                Repository path (fixed)
              </FieldLabel>
              <Input
                id="edit-repo-path"
                value={pill.repoPath}
                readOnly
                disabled
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-slug">
                Subdomain slug (fixed)
              </FieldLabel>
              <Input id="edit-slug" value={pill.slug} readOnly disabled />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-commandName">
                Command profile
              </FieldLabel>
              <Input
                id="edit-commandName"
                name="commandName"
                defaultValue={command?.name ?? "dev"}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-command">Command</FieldLabel>
              <Input
                id="edit-command"
                name="command"
                defaultValue={command ? commandToString(command.argv) : ""}
                required
              />
              <FieldDescription>
                Quote multi-word arguments, e.g. sh -lc &apos;bun run dev&apos;.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-cwd">Command cwd</FieldLabel>
              <Input
                id="edit-cwd"
                name="cwd"
                defaultValue={command?.cwd ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-env">Environment</FieldLabel>
              <Textarea
                id="edit-env"
                name="env"
                rows={4}
                defaultValue={command ? envToText(command.env) : ""}
              />
              <FieldDescription>
                One KEY=VALUE per line. Use $UPSTER_PORT for the assigned port.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-healthcheck">
                Healthcheck path
              </FieldLabel>
              <Input
                id="edit-healthcheck"
                name="healthcheckPath"
                defaultValue={command?.healthcheckPath ?? ""}
                placeholder="/"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
