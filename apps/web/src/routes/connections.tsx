import { createFileRoute } from "@tanstack/react-router"

import { AccessDenied } from "@/components/access-denied"
import { Page } from "@/components/layout"
import { loadConnectionsPage } from "@/features/connections/connections-shared"
import { LockdownPanel } from "@/features/connections/lockdown-panel"
import { PairedConnections } from "@/features/connections/paired-connections"
import { PairingLinks } from "@/features/connections/pairing-links"
import { TailscaleCard } from "@/features/connections/tailscale-card"
import { useIsRemoteEnvironment } from "@/lib/environment"

export const Route = createFileRoute("/connections")({
  loader: loadConnectionsPage,
  errorComponent: AccessDenied,
  component: ConnectionsPage,
})

function ConnectionsPage() {
  const { connections, pairingLinks, endpoints, tailscale } =
    Route.useLoaderData()
  const remote = useIsRemoteEnvironment()

  return (
    <Page
      title="Remote Access"
      description="Expose this dashboard over Tailscale and pair trusted browsers."
    >
      <TailscaleCard status={tailscale} remote={remote} />
      <PairingLinks endpoints={endpoints} links={pairingLinks} />
      <PairedConnections connections={connections} />
      {tailscale.available ? <LockdownPanel remote={remote} /> : null}
    </Page>
  )
}
