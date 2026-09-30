import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { AuthPanel } from "@/features/auth/auth-panel"
import { getAuthStatusFn, setupAdminFn } from "@/features/auth/auth.functions"

export const Route = createFileRoute("/setup")({
  beforeLoad: async () => {
    const status = await getAuthStatusFn()
    if (status.authenticated) {
      throw redirect({ to: "/" })
    }
    if (status.pairingRequired) {
      throw redirect({ to: "/pair" })
    }
    if (status.hasAdmin) {
      throw redirect({ to: "/login" })
    }
  },
  component: SetupPage,
})

function SetupPage() {
  const router = useRouter()
  const setupAdmin = useServerFn(setupAdminFn)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = new FormData(event.currentTarget)
    const passphrase = String(form.get("passphrase") ?? "")
    const confirm = String(form.get("confirm") ?? "")

    if (passphrase !== confirm) {
      toast.error("The passphrases do not match.")
      return
    }

    setPending(true)
    try {
      await setupAdmin({ data: { passphrase } })
      await router.invalidate()
      await router.navigate({ to: "/" })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create the admin user."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthPanel
      title="Set up Upster"
      description="Create the admin passphrase that protects this dashboard."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field>
          <FieldLabel htmlFor="passphrase">Admin passphrase</FieldLabel>
          <Input
            id="passphrase"
            name="passphrase"
            type="password"
            minLength={12}
            autoFocus
            required
          />
          <FieldDescription>
            Use at least 12 characters. This cannot be recovered.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm">Confirm passphrase</FieldLabel>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            minLength={12}
            required
          />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating..." : "Create admin and continue"}
        </Button>
      </form>
    </AuthPanel>
  )
}
