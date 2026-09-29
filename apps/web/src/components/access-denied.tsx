import {
  ErrorComponent,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import { ShieldXIcon } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { isScopeDeniedMessage } from "@/features/auth/scope-error"

export function AccessDenied({ error }: ErrorComponentProps) {
  if (isScopeDeniedMessage(error.message)) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldXIcon />
          </EmptyMedia>
          <EmptyTitle>You do not have access to this page</EmptyTitle>
          <EmptyDescription>
            This connection was granted a limited set of permissions. Ask the
            operator who paired this device for broader access.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return <ErrorComponent error={error} />
}
