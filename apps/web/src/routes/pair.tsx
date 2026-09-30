import { useEffect, useRef, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"

import { Notice } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { AuthPanel } from "@/features/auth/auth-panel"
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
    <AuthPanel
      title="Pair this device"
      description="Connect this browser to your Upster dashboard."
    >
      {state.status === "pending" ? (
        <Notice title="Pairing device">
          Checking the pairing link and creating the device connection.
        </Notice>
      ) : null}

      {state.status === "success" ? (
        <>
          <Notice tone="success" title="This device is now paired">
            You can use this browser to manage Upster from this origin.
          </Notice>
          <Button size="lg" onClick={() => void router.navigate({ to: "/" })}>
            Open dashboard
          </Button>
        </>
      ) : null}

      {state.status === "error" || state.status === "idle" ? (
        <form className="flex flex-col gap-4" onSubmit={handleManualSubmit}>
          {state.status === "error" ? (
            <Notice tone="danger" role="alert" title="Pairing failed">
              {state.message}
            </Notice>
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
          <Button type="submit" size="lg">
            Pair device
          </Button>
        </form>
      ) : null}
    </AuthPanel>
  )
}
