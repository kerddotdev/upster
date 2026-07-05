import { useState, type FormEvent } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  getRuntimeSettingsFn,
  updateCloudflaredBinFn,
  updateRuntimeSettingsFn,
} from "@/features/config/settings.functions"
import { AccessDenied } from "@/components/access-denied"

export const Route = createFileRoute("/settings/runtime")({
  loader: () => getRuntimeSettingsFn(),
  errorComponent: AccessDenied,
  component: RuntimeSettingsPage,
})

function RuntimeSettingsPage() {
  const settings = Route.useLoaderData()
  const router = useRouter()
  const updateRuntimeSettings = useServerFn(updateRuntimeSettingsFn)
  const updateCloudflaredBin = useServerFn(updateCloudflaredBinFn)

  const [appPortRange, setAppPortRange] = useState(settings.appPortRange)
  const [metricsPortRange, setMetricsPortRange] = useState(
    settings.metricsPortRange
  )
  const [publicOrigin, setPublicOrigin] = useState(settings.publicOrigin)
  const [capsuleRetention, setCapsuleRetention] = useState(
    settings.capsuleRetention
  )
  const [cloudflaredBin, setCloudflaredBin] = useState(settings.cloudflaredBin)
  const [savingRuntime, setSavingRuntime] = useState(false)
  const [savingBin, setSavingBin] = useState(false)

  async function handleSaveRuntime(event: FormEvent) {
    event.preventDefault()
    setSavingRuntime(true)
    try {
      await updateRuntimeSettings({
        data: {
          appPortRange,
          metricsPortRange,
          publicOrigin,
          capsuleRetention,
        },
      })
      toast.success("Runtime settings saved.")
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.")
    } finally {
      setSavingRuntime(false)
    }
  }

  async function handleSaveBin(event: FormEvent) {
    event.preventDefault()
    setSavingBin(true)
    try {
      await updateCloudflaredBin({ data: { cloudflaredBin } })
      toast.success("cloudflared binary saved.")
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.")
    } finally {
      setSavingBin(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium">Runtime settings</h1>
        <p className="text-sm text-muted-foreground">
          Operational values are stored in the database and editable here.
          Fields set through the environment take precedence and are read-only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ports and capsules</CardTitle>
          <CardDescription>
            Pill app and metrics ports are checked and rotated on start.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={handleSaveRuntime}
          >
            <EditableField
              label="App port range"
              value={appPortRange}
              onChange={setAppPortRange}
              envManaged={settings.envManaged.appPortRange}
              placeholder="41000-49151"
            />
            <EditableField
              label="Metrics port range"
              value={metricsPortRange}
              onChange={setMetricsPortRange}
              envManaged={settings.envManaged.metricsPortRange}
              placeholder="52000-60999"
            />
            <EditableField
              label="Dashboard origin"
              value={publicOrigin}
              onChange={setPublicOrigin}
              envManaged={settings.envManaged.publicOrigin}
              placeholder="https://localhost:3377"
            />
            <EditableField
              label="Capsule retention"
              value={capsuleRetention}
              onChange={setCapsuleRetention}
              envManaged={settings.envManaged.capsuleRetention}
              placeholder="10"
            />
            <div className="md:col-span-2">
              <Button type="submit" disabled={savingRuntime}>
                {savingRuntime ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>cloudflared binary</CardTitle>
          <CardDescription>
            The executable used to run tunnels. Editable only from a local
            session because it names a program Upster spawns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={handleSaveBin}>
            <EditableField
              label="cloudflared binary"
              value={cloudflaredBin}
              onChange={setCloudflaredBin}
              envManaged={settings.envManaged.cloudflaredBin}
              placeholder="cloudflared"
              disabled={!settings.localAdmin}
            />
            {!settings.localAdmin && !settings.envManaged.cloudflaredBin ? (
              <p className="text-xs text-muted-foreground">
                Connect from this machine to change the cloudflared binary.
              </p>
            ) : null}
            <div>
              <Button
                type="submit"
                disabled={
                  savingBin ||
                  !settings.localAdmin ||
                  settings.envManaged.cloudflaredBin
                }
              >
                {savingBin ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace mount</CardTitle>
          <CardDescription>
            Host paths are translated to container paths before validation.
            These are set through the environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ReadOnlySetting
            label="Allowed commands"
            value={
              settings.allowedCommands.length
                ? settings.allowedCommands.join(", ")
                : "any (unrestricted)"
            }
          />
          {settings.hostWorkspaceRoot && (
            <ReadOnlySetting
              label="Host workspace root"
              value={settings.hostWorkspaceRoot}
            />
          )}
          {settings.workspaceRoots.map((root) => (
            <ReadOnlySetting
              key={root}
              label="Container workspace root"
              value={root}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function EditableField({
  label,
  value,
  onChange,
  envManaged,
  placeholder,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  envManaged: boolean
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <Field>
      <FieldLabel className="flex items-center gap-2">
        {label}
        {envManaged ? (
          <Badge variant="outline" className="text-[10px]">
            env
          </Badge>
        ) : null}
      </FieldLabel>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={envManaged || disabled}
      />
    </Field>
  )
}

function ReadOnlySetting({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium break-all">{value}</div>
    </div>
  )
}
