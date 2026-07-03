import {
  deleteInactiveRuns,
  listCapsules,
  listRuns,
} from "@/db/repositories.server"
import { deleteCapsuleVersion } from "@/features/capsules/capsule.server"
import type { Capsule } from "@/features/capsules/types"
import type { PillRun } from "@/features/pills/types"

export type PillDiagnostics = {
  runs: Array<PillRun>
  capsuleErrors: Array<Capsule>
}

export async function getPillDiagnostics(
  pillId: string
): Promise<PillDiagnostics> {
  const [runs, capsules] = await Promise.all([
    listRuns(pillId, 20),
    listCapsules(pillId),
  ])

  return {
    runs,
    capsuleErrors: capsules.filter((capsule) => capsule.status === "error"),
  }
}

export async function clearPillDiagnostics(pillId: string) {
  await deleteInactiveRuns(pillId)

  const capsules = await listCapsules(pillId)
  for (const capsule of capsules.filter((entry) => entry.status === "error")) {
    await deleteCapsuleVersion(capsule.id).catch(() => undefined)
  }

  return getPillDiagnostics(pillId)
}
