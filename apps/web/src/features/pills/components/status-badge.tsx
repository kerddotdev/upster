import { StatusBadge as ToneBadge, type Tone } from "@/components/status"
import type { PillRunSource, PillStatus } from "@/features/pills/types"

const statusMeta: Record<PillStatus, { label: string; tone: Tone }> = {
  idle: { label: "Idle", tone: "idle" },
  starting: { label: "Starting", tone: "progress" },
  running: { label: "Running", tone: "success" },
  stopping: { label: "Stopping", tone: "progress" },
  error: { label: "Error", tone: "danger" },
  expired: { label: "Expired", tone: "idle" },
}

export function statusLabel(status: PillStatus) {
  return statusMeta[status].label
}

export function statusTone(status: PillStatus) {
  return statusMeta[status].tone
}

const sourceLabels: Record<PillRunSource, string> = {
  live: "Live",
  capsule: "Snapshot",
}

export function StatusBadge({
  status,
  source,
}: {
  status: PillStatus
  source?: PillRunSource | null
}) {
  const meta = statusMeta[status]
  const label =
    status === "running" && source
      ? `${meta.label} - ${sourceLabels[source]}`
      : meta.label
  return <ToneBadge tone={meta.tone} label={label} />
}
