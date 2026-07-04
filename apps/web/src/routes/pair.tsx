import { useEffect, useRef, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { redeemPairingTokenFn } from "@/features/connections/pairing.functions"

export const Route = createFileRoute("/pair")({
  component: PairPage,
})

type PairState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | { status: "error"; message: string }

function readTokenFromHash() {
  const hash = window.location.hash.slice(1)
  if (!hash) {
    return null
  }

  const params = new URLSearchParams(hash)
  return params.get("token") ?? (!hash.includes("=") ? hash : null)
}

function PairPage() {
  const redeemPairingToken = useServerFn(redeemPairingTokenFn)
  const router = useRouter()
  const didReadHash = useRef(false)
  const [state, setState] = useState<PairState>({ status: "idle" })
  const [manualToken, setManualToken] = useState("")

  async function redeemToken(token: string) {
    setState({ status: "pending" })
    const result = await redeemPairingToken({ data: { token } })

    if (result.ok) {
      await router.invalidate()
      setState({ status: "success" })
      return
    }

    setState({
      status: "error",
      message:
        result.reason === "rate_limited"
          ? "Too many attempts. Wait a minute, then try again."
          : "This pairing link is invalid or has expired.",
    })
  }

  useEffect(() => {
    if (didReadHash.current) {
      return
    }

    didReadHash.current = true
    const token = readTokenFromHash()
    if (window.location.hash) {
      window.history.replaceState(null, "", "/pair")
    }

    if (token) {
      void redeemToken(token)
    }
  })

  async function handleManualSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = manualToken.trim()
    if (!token) {
      return
    }

    await redeemToken(token)
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Pair this device</CardTitle>
          <CardDescription>
            Connect this browser to your Upster dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state.status === "pending" ? (
            <Alert>
              <AlertTitle>Pairing device</AlertTitle>
              <AlertDescription>
                Checking the pairing link and creating the device connection.
              </AlertDescription>
            </Alert>
          ) : null}

          {state.status === "success" ? (
            <div className="flex flex-col gap-4">
              <Alert>
                <AlertTitle>This device is now paired</AlertTitle>
                <AlertDescription>
                  You can use this browser to manage Upster from this origin.
                </AlertDescription>
              </Alert>
              <Button onClick={() => void router.navigate({ to: "/" })}>
                Open dashboard
              </Button>
            </div>
          ) : null}

          {state.status === "error" || state.status === "idle" ? (
            <form className="flex flex-col gap-4" onSubmit={handleManualSubmit}>
              {state.status === "error" ? (
                <Alert variant="destructive">
                  <AlertTitle>Pairing failed</AlertTitle>
                  <AlertDescription>{state.message}</AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor="pairingToken">Pairing token</FieldLabel>
                <Input
                  id="pairingToken"
                  value={manualToken}
                  onChange={(event) => setManualToken(event.target.value)}
                  autoFocus
                  autoComplete="off"
                />
              </Field>
              <Button type="submit">Pair device</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
