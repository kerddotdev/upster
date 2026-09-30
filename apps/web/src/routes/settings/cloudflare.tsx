import { createFileRoute } from "@tanstack/react-router"

import { AccessDenied } from "@/components/access-denied"
import { Page } from "@/components/layout"
import { CloudflareSettingsForm } from "@/features/secrets/cloudflare-settings-form"
import { getCloudflareVaultStatusFn } from "@/features/secrets/secret.functions"

export const Route = createFileRoute("/settings/cloudflare")({
  loader: () => getCloudflareVaultStatusFn(),
  errorComponent: AccessDenied,
  component: CloudflareSettingsPage,
})

function CloudflareSettingsPage() {
  const status = Route.useLoaderData()

  return (
    <Page
      title="Cloudflare"
      description="Save an encrypted local vault and unlock it only in control plane memory."
    >
      <CloudflareSettingsForm status={status} />
    </Page>
  )
}
