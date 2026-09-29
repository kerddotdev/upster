import { createFileRoute } from "@tanstack/react-router"

import { AccessDenied } from "@/components/access-denied"
import { CloudflareSettingsForm } from "@/features/secrets/cloudflare-settings-form"
import { getCloudflareVaultStatusFn } from "@/features/secrets/secret.functions"

export const Route = createFileRoute("/settings/cloudflare")({
  loader: () => getCloudflareVaultStatusFn(),
  errorComponent: AccessDenied,
  component: CloudflareSettingsPage,
})

function CloudflareSettingsPage() {
  const status = Route.useLoaderData()

  return <CloudflareSettingsForm status={status} />
}
