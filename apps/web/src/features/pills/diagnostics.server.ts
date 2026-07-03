import { listCapsules, listRuns } from "@/db/repositories.server"
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
