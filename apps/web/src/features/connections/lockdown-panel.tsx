import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"

import { List, Row, Section } from "@/components/layout"
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
import { panicLockdownFn } from "@/features/connections/connection.functions"
import { useHasScopes } from "@/features/auth/use-scopes"

export function LockdownPanel({ remote }: { remote: boolean }) {
  const router = useRouter()
  const panicLockdown = useServerFn(panicLockdownFn)
  const canManage = useHasScopes("connections:manage")
  const [pending, setPending] = useState(false)

  if (remote || !canManage) {
    return null
  }

  async function lockdown() {
    setPending(true)
    try {
      await panicLockdown()
      toast.success("Remote Access locked down.")
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Section title="Emergency lockdown">
      <List>
        <Row
          title="Lock down remote access"
          detail="Revoke every connection, lock the Cloudflare vault, and turn off remote access in one step. Running pills keep serving."
          trailing={
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="destructive" disabled={pending} />}
              >
                Lock down
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Lock down remote access?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This immediately revokes all paired connections, locks the
                    Cloudflare vault, and disables Tailscale serve. Already
                    running pills and tunnels are not affected. You can
                    re-enable remote access afterwards from this host.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={pending}
                    onClick={() => void lockdown()}
                  >
                    Lock down
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          }
        />
      </List>
    </Section>
  )
}
