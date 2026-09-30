import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { NetworkIcon } from "lucide-react"
import { toast } from "sonner"

import { Details, Mono, Notice } from "@/components/layout"
import { StatusBadge, type Tone } from "@/components/status"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { GatedButton } from "@/features/auth/gated-button"
import { useHasScopes } from "@/features/auth/use-scopes"
import type { TailscaleStatusRow } from "@/features/connections/connections-shared"
import {
  disableTailscaleServeFn,
  enableTailscaleServeFn,
  startTailscaleLoginFn,
} from "@/features/tailscale/tailscale.functions"

function remoteAccessStatus(status: TailscaleStatusRow): {
  tone: Tone
  label: string
} {
  if (!status.available) {
    return { tone: "idle", label: "Unavailable" }
  }
  if (status.funnelActive) {
    return { tone: "danger", label: "Funnel" }
  }
  if (!status.loggedIn) {
    return { tone: "idle", label: "Not connected" }
  }
  if (status.serveHttpsActive) {
    return { tone: "success", label: "On" }
  }
  return { tone: "running", label: "Connected" }
}

function DisableRemoteAccessButton({
  remote,
  pending,
  onDisable,
}: {
  remote: boolean
  pending: boolean
  onDisable: () => void
}) {
  if (!remote) {
    return (
      <Button variant="outline" disabled={pending} onClick={onDisable}>
        Disable remote access
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="outline" disabled={pending} />}
      >
        Disable remote access
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disable remote access?</AlertDialogTitle>
          <AlertDialogDescription>
            You are connected through Tailscale right now. Turning off remote
            access ends this session immediately, and you will not be able to
            reconnect from here until you re-enable it directly on the host
            machine.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep it on</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={onDisable}
          >
            Disable anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function TailscaleCard({
  status,
  remote,
}: {
  status: TailscaleStatusRow
  remote: boolean
}) {
  const router = useRouter()
  const startLogin = useServerFn(startTailscaleLoginFn)
  const enableServe = useServerFn(enableTailscaleServeFn)
  const disableServe = useServerFn(disableTailscaleServeFn)
  const canManage = useHasScopes("connections:manage")
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const badge = remoteAccessStatus(status)

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
    <section className="flex rise-in flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border">
      <div className="flex items-start gap-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground/80">
          <NetworkIcon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-[15px] font-medium">Tailscale</h2>
            <span className="ml-auto">
              <StatusBadge tone={badge.tone} label={badge.label} />
            </span>
          </div>
          <p className="mt-1 max-w-[62ch] text-muted-foreground">
            {status.available
              ? "Reach this dashboard from other devices on your private tailnet."
              : "The Tailscale sidecar is not reachable. Start the stack with docker compose up."}
          </p>
        </div>
      </div>

      {status.available ? (
        <div className="flex flex-col gap-3 pl-[50px]">
          {status.funnelActive ? (
            <Notice
              tone="danger"
              role="alert"
              title="Funnel is exposing this dashboard"
            >
              Tailscale Funnel is publishing this node to the public internet.
              Upster never enables Funnel itself. Turn it off on the host with{" "}
              <Mono>tailscale funnel off</Mono> unless you intend the dashboard
              to be publicly reachable.
            </Notice>
          ) : null}

          {status.loggedIn ? (
            <>
              {status.magicDnsName ? (
                <Details
                  items={[
                    ["MagicDNS name", <Mono>{status.magicDnsName}</Mono>],
                  ]}
                />
              ) : null}
              <div className="flex flex-wrap gap-2">
                {!canManage ? (
                  <GatedButton
                    scopes={["connections:manage"]}
                    variant="outline"
                  >
                    {status.serveHttpsActive
                      ? "Disable remote access"
                      : "Enable remote access"}
                  </GatedButton>
                ) : status.serveHttpsActive ? (
                  <DisableRemoteAccessButton
                    remote={remote}
                    pending={pending}
                    onDisable={() =>
                      void run(() => disableServe(), "Remote Access disabled.")
                    }
                  />
                ) : (
                  <Button
                    disabled={pending}
                    onClick={() =>
                      void run(() => enableServe(), "Remote Access enabled.")
                    }
                  >
                    Enable remote access
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                Connect this node to your tailnet to enable remote access.
              </p>
              <div className="flex flex-wrap gap-2">
                <GatedButton
                  scopes={["connections:manage"]}
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
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
                </GatedButton>
              </div>
              {authUrl ? (
                <Notice title="Approve this node">
                  <a
                    href={authUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all underline underline-offset-3"
                  >
                    {authUrl}
                  </a>
                </Notice>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
