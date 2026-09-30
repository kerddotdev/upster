import { StatusBadge as ToneBadge, type Tone } from "@/components/status"
import type { PillStatus } from "@/features/pills/types"

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

export function StatusBadge({ status }: { status: PillStatus }) {
  const meta = statusMeta[status]
  return <ToneBadge tone={meta.tone} label={meta.label} />
}
