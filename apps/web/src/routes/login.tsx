import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
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
    <div className="mx-auto flex min-h-screen w-full max-w-sm items-center justify-center p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in to Upster</CardTitle>
          <CardDescription>
            Enter the admin passphrase to access the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
            <Button type="submit" disabled={pending}>
              {pending ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
