import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"

import { logoutFn } from "@/features/auth/auth.functions"

export function useLogout() {
  const router = useRouter()
  const logout = useServerFn(logoutFn)
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    try {
      await logout({})
      await router.invalidate()
      await router.navigate({ to: "/login" })
    } catch {
      toast.error("Could not sign out.")
    } finally {
      setPending(false)
    }
  }

  return { signOut, pending }
}
