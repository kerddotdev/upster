import { useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  disableTailscaleServeFn,
  enableTailscaleServeFn,
  getTailscaleStatusFn,
  startTailscaleLoginFn,
} from "@/features/tailscale/tailscale.functions"

export const Route = createFileRoute("/settings/tailscale")({
  loader: () => getTailscaleStatusFn(),
  component: TailscalePage,
})

function TailscalePage() {
  const status = Route.useLoaderData()
  const router = useRouter()
  const startLogin = useServerFn(startTailscaleLoginFn)
  const enableServe = useServerFn(enableTailscaleServeFn)
  const disableServe = useServerFn(disableTailscaleServeFn)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function run(action: () => Promise<unknown>, success: string) {
    setPending(true)
    try {
      await action()
      toast.success(success)
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium">Tailscale remote access</h1>
        <p className="text-sm text-muted-foreground">
          Reach the dashboard from other devices on your private tailnet. The
          Tailscale node runs as a sidecar container; the dashboard never holds
          tailnet credentials.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Status
            <StatusBadge status={status} />
          </CardTitle>
          <CardDescription>
            {status.available
              ? "The Tailscale sidecar is reachable."
              : "The Tailscale sidecar is not reachable. Start the stack with docker compose up."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {status.available && !status.loggedIn ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Connect this node to your tailnet to enable remote access.
              </p>
              <div>
                <Button
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const result = await startLogin()
                      setAuthUrl(result.authUrl)
                      if (!result.authUrl) {
                        throw new Error(
                          "No login URL returned. Check the sidecar logs."
                        )
                      }
                    }, "Login started.")
                  }
                >
                  Connect to tailnet
                </Button>
              </div>
              {authUrl ? (
                <Alert>
                  <AlertTitle>Approve this node</AlertTitle>
                  <AlertDescription>
                    <a
                      href={authUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all underline"
                    >
                      {authUrl}
                    </a>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          {status.available && status.loggedIn ? (
            <div className="flex flex-col gap-3">
              {status.magicDnsName ? (
                <Detail label="MagicDNS name" value={status.magicDnsName} />
              ) : null}
              {status.tailscaleIps.length ? (
                <Detail
                  label="Tailscale IPs"
                  value={status.tailscaleIps.join(", ")}
                />
              ) : null}
              <div className="flex items-center gap-3">
                {status.serveHttpsActive ? (
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() => disableServe(), "Remote access disabled.")
                    }
                  >
                    Disable remote access
                  </Button>
                ) : (
                  <Button
                    disabled={pending}
                    onClick={() =>
                      run(() => enableServe(), "Remote access enabled.")
                    }
                  >
                    Enable remote access
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({
  status,
}: {
  status: { available: boolean; loggedIn: boolean; serveHttpsActive: boolean }
}) {
  if (!status.available) {
    return <Badge variant="outline">Unavailable</Badge>
  }
  if (!status.loggedIn) {
    return <Badge variant="outline">Not connected</Badge>
  }
  if (status.serveHttpsActive) {
    return <Badge>Remote access on</Badge>
  }
  return <Badge variant="outline">Connected</Badge>
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium break-all">{value}</div>
    </div>
  )
}
