import {
  ErrorComponent,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import { ShieldXIcon } from "lucide-react"

import { Page } from "@/components/layout"
import { isScopeDeniedMessage } from "@/features/auth/scope-error"

export function AccessDenied({ error }: ErrorComponentProps) {
  if (isScopeDeniedMessage(error.message)) {
    return (
      <Page title="Access denied">
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ShieldXIcon className="size-8 text-muted-foreground" aria-hidden />
          <h2 className="font-heading text-lg font-medium">
            You do not have access to this page
          </h2>
          <p className="max-w-[46ch] text-muted-foreground">
            This connection was granted a limited set of permissions. Ask the
            operator who paired this device for broader access.
          </p>
        </div>
      </Page>
    )
  }

  return (
    <Page title="Something went wrong">
      <ErrorComponent error={error} />
    </Page>
  )
}
