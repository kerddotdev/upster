import { ExternalLinkIcon } from "lucide-react"

import { List, Row, Section } from "@/components/layout"
import { Button } from "@/components/ui/button"

const TOKEN_PERMISSIONS = [
  {
    scope: "Account",
    name: "Cloudflare One Networks",
    why: "Routes tunnel traffic to your local app.",
    key: "teams_networks",
  },
  {
    scope: "Account",
    name: "Cloudflare One Connector: cloudflared",
    why: "Creates the tunnel and fetches its run token.",
    key: "teams_connector_cloudflared",
  },
  {
    scope: "Account",
    name: "Load Balancing: Monitors and Pools",
    why: "Required by the tunnel configuration API.",
    key: "load_balancing_monitors_and_pools",
  },
  {
    scope: "Zone",
    name: "DNS",
    why: "Points each pill hostname at its tunnel.",
    key: "dns",
  },
] as const

const TOKEN_TEMPLATE_URL = `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${encodeURIComponent(
  JSON.stringify(
    TOKEN_PERMISSIONS.map((permission) => ({
      key: permission.key,
      type: "edit",
    }))
  )
)}&accountId=*&zoneId=all&name=${encodeURIComponent(
  "Cloudflare Tunnel API Token via Upster"
)}`

const DASHBOARD_URL = "https://dash.cloudflare.com/"

export function CloudflareSetupGuide() {
  return (
    <>
      <Section
        title="API token"
        description="The prefilled page already has the right permissions selected. Scope it to your account and your domain's zone; client IP filtering and TTL are not needed."
        actions={
          <Button
            size="sm"
            render={
              <a href={TOKEN_TEMPLATE_URL} target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLinkIcon data-icon="inline-start" />
            Create API token
          </Button>
        }
      >
        <List>
          {TOKEN_PERMISSIONS.map((permission) => (
            <Row
              key={permission.name}
              title={`${permission.scope} - ${permission.name}`}
              detail={permission.why}
            />
          ))}
        </List>
      </Section>

      <Section title="Account ID and Zone ID">
        <List>
          <Row
            title="Find them in the dashboard"
            detail="Both sit in the right sidebar of your domain's Overview page."
            trailing={
              <Button
                variant="secondary"
                size="sm"
                render={
                  <a href={DASHBOARD_URL} target="_blank" rel="noreferrer" />
                }
              >
                <ExternalLinkIcon data-icon="inline-start" />
                Open dashboard
              </Button>
            }
          />
        </List>
      </Section>
    </>
  )
}
