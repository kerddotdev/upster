import { useState, type FormEvent } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"

import { List, Mono, Notice, Page, Row, Section } from "@/components/layout"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  getRuntimeSettingsFn,
  updateCloudflaredBinFn,
  updateRuntimeSettingsFn,
} from "@/features/config/settings.functions"
import { AccessDenied } from "@/components/access-denied"
import { GatedButton } from "@/features/auth/gated-button"

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
    <Page
      title="Runtime settings"
      description="Operational values are stored in the database and editable here. Fields set through the environment take precedence and are read-only."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSaveRuntime}>
        <Section
          title="Ports and capsules"
          description="Pill app and metrics ports are checked and rotated on start."
        >
          <List>
            <EditableRow
              label="App port range"
              value={appPortRange}
              onChange={setAppPortRange}
              envManaged={settings.envManaged.appPortRange}
              placeholder="41000-49151"
            />
            <EditableRow
              label="Metrics port range"
              value={metricsPortRange}
              onChange={setMetricsPortRange}
              envManaged={settings.envManaged.metricsPortRange}
              placeholder="52000-60999"
            />
            <EditableRow
              label="Dashboard origin"
              value={publicOrigin}
              onChange={setPublicOrigin}
              envManaged={settings.envManaged.publicOrigin}
              placeholder="https://localhost:3377"
            />
            <EditableRow
              label="Capsule retention"
              value={capsuleRetention}
              onChange={setCapsuleRetention}
              envManaged={settings.envManaged.capsuleRetention}
              placeholder="10"
            />
          </List>
        </Section>
        <div>
          <GatedButton
            scopes={["settings:write"]}
            type="submit"
            disabled={savingRuntime}
          >
            {savingRuntime ? "Saving..." : "Save"}
          </GatedButton>
        </div>
      </form>

      <form className="flex flex-col gap-4" onSubmit={handleSaveBin}>
        <Section
          title="cloudflared binary"
          description="The executable used to run tunnels. Editable only from a local session because it names a program Upster spawns."
        >
          <List>
            <EditableRow
              label="cloudflared binary"
              value={cloudflaredBin}
              onChange={setCloudflaredBin}
              envManaged={settings.envManaged.cloudflaredBin}
              placeholder="cloudflared"
              disabled={!settings.localAdmin}
            />
          </List>
          {!settings.localAdmin && !settings.envManaged.cloudflaredBin ? (
            <Notice>
              Connect from this machine to change the cloudflared binary.
            </Notice>
          ) : null}
        </Section>
        <div>
          <GatedButton
            scopes={["settings:write"]}
            type="submit"
            disabled={
              savingBin ||
              !settings.localAdmin ||
              settings.envManaged.cloudflaredBin
            }
          >
            {savingBin ? "Saving..." : "Save"}
          </GatedButton>
        </div>
      </form>

      <Section
        title="Workspace mount"
        description="Host paths are translated to container paths before validation. These are set through the environment."
      >
        <List>
          <Row
            title="Allowed commands"
            trailing={
              <Mono className="text-foreground">
                {settings.allowedCommands.length
                  ? settings.allowedCommands.join(", ")
                  : "any (unrestricted)"}
              </Mono>
            }
          />
          {settings.hostWorkspaceRoot && (
            <Row
              title="Host workspace root"
              trailing={
                <Mono className="text-foreground">
                  {settings.hostWorkspaceRoot}
                </Mono>
              }
            />
          )}
          {settings.workspaceRoots.map((root) => (
            <Row
              key={root}
              title="Container workspace root"
              trailing={<Mono className="text-foreground">{root}</Mono>}
            />
          ))}
        </List>
      </Section>
    </Page>
  )
}

function EditableRow({
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
    <Row
      title={
        <span className="flex items-center gap-2">
          {label}
          {envManaged ? (
            <Badge variant="outline">Environment managed</Badge>
          ) : null}
        </span>
      }
      trailing={
        <Input
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={envManaged || disabled}
          className="w-64"
        />
      }
    />
  )
}
