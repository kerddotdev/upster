import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { AuthPanel } from "@/features/auth/auth-panel"
import { getAuthStatusFn, loginFn } from "@/features/auth/auth.functions"

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const status = await getAuthStatusFn()
    if (status.authenticated) {
      throw redirect({ to: "/" })
    }
    if (status.pairingRequired) {
      throw redirect({ to: "/pair" })
    }
    if (!status.hasAdmin) {
      throw redirect({ to: "/setup" })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const login = useServerFn(loginFn)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)

    const form = new FormData(event.currentTarget)
    const passphrase = String(form.get("passphrase") ?? "")

    try {
      await login({ data: { passphrase } })
      await router.invalidate()
      await router.navigate({ to: "/" })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in.")
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthPanel
      title="Sign in to Upster"
      description="Enter the admin passphrase to access the dashboard."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field>
          <FieldLabel htmlFor="passphrase">Passphrase</FieldLabel>
          <Input
            id="passphrase"
            name="passphrase"
            type="password"
            autoFocus
            required
          />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthPanel>
  )
}
