export type ReleaseAsset = {
  name: string
  size: number
  state: string
}

export type Release = {
  tag_name: string
  draft: boolean
  assets: Array<ReleaseAsset>
}

export function requiredAssets(version: string): Array<string> {
  return [
    "checksums.sha256",
    "docker-compose.yaml",
    "env.example",
    ...["macos", "linux"].flatMap((platform) =>
      ["arm64", "x64"].map((arch) => `upster-${platform}-${arch}.tar.gz`)
    ),
    ...["darwin", "linux"].flatMap((platform) =>
      ["arm64", "x64"].map((arch) => `upster-server-${platform}-${arch}.tar.gz`)
    ),
    ...["", "-arm64"].flatMap((arch) => [
      `Upster-${version}${arch}.dmg`,
      `Upster-${version}${arch}.dmg.blockmap`,
      `Upster-${version}${arch}-mac.zip`,
      `Upster-${version}${arch}-mac.zip.blockmap`,
    ]),
    ...["x86_64", "arm64"].map((arch) => `Upster-${version}-${arch}.AppImage`),
    ...["amd64", "arm64"].map((arch) => `Upster-${version}-${arch}.deb`),
    "latest-mac.yml",
    "latest-linux.yml",
    "latest-linux-arm64.yml",
  ]
}

export function assertDraft(release: Release, version: string): void {
  if (release.tag_name !== `v${version}`) {
    throw new Error(`Expected release v${version}, got ${release.tag_name}`)
  }
  if (release.draft !== true) {
    throw new Error(
      `Release v${version} is already public; refusing to modify it`
    )
  }
}

export function assertComplete(release: Release, version: string): void {
  assertDraft(release, version)
  const missing = requiredAssets(version).filter(
    (name) =>
      !release.assets.some(
        (asset) =>
          asset.name === name && asset.state === "uploaded" && asset.size > 0
      )
  )
  if (missing.length > 0) {
    throw new Error(
      `Release v${version} has missing or incomplete assets: ${missing.join(", ")}`
    )
  }
}

export async function getRelease(
  repository: string,
  version: string,
  token: string,
  request: typeof fetch = fetch
): Promise<Release | null> {
  for (let page = 1; ; page++) {
    const response = await request(
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    )
    if (!response.ok) {
      throw new Error(
        `Could not read release v${version}: HTTP ${response.status}`
      )
    }
    const releases = (await response.json()) as Array<Release>
    if (!Array.isArray(releases)) {
      throw new Error(
        `Could not read release v${version}: invalid release list`
      )
    }
    const release = releases.find((item) => item.tag_name === `v${version}`)
    if (release) return release
    if (releases.length < 100) return null
  }
}
