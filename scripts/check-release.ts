import { assertComplete, assertDraft, getRelease } from "./release-gate"

const [mode, version] = process.argv.slice(2)
const repository = process.env.GITHUB_REPOSITORY
const token = process.env.GH_TOKEN

if (
  !["prepare", "publish"].includes(mode) ||
  !version ||
  !repository ||
  !token
) {
  throw new Error(
    "Usage: check-release.ts <prepare|publish> <version> with GITHUB_REPOSITORY and GH_TOKEN"
  )
}

const release = await getRelease(repository, version, token)
if (mode === "prepare") {
  if (release) assertDraft(release, version)
} else {
  if (!release) throw new Error(`Draft release v${version} does not exist`)
  assertComplete(release, version)
}
