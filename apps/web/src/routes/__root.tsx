import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import { Page } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell } from "@/shell/app-shell"
import { ErrorReportProvider } from "@/components/error-report"
import { CloudflareVaultProvider } from "@/features/secrets/cloudflare-vault-provider"
import { getAuthStatusFn } from "@/features/auth/auth.functions"
import appCss from "../styles.css?url"

export const Route = createRootRoute({
  loader: () => getAuthStatusFn(),
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Upster",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function NotFound() {
  return (
    <Page title="Page not found">
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <h2 className="font-heading text-lg font-medium">404</h2>
        <p className="text-muted-foreground">
          The requested page could not be found.
        </p>
        <Button size="sm" render={<Link to="/" />}>
          Back to dashboard
        </Button>
      </div>
    </Page>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <TooltipProvider>
          <ErrorReportProvider>
            <CloudflareVaultProvider>
              <AppShell>{children}</AppShell>
            </CloudflareVaultProvider>
          </ErrorReportProvider>
        </TooltipProvider>
        <Toaster />
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "TanStack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
