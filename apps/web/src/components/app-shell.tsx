import { Link, useRouterState } from "@tanstack/react-router"
import {
  CloudIcon,
  FolderKanbanIcon,
  KeyRoundIcon,
  SettingsIcon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { LogoutButton } from "@/features/auth/logout-button"
import { CloudflareLockButton } from "@/features/secrets/cloudflare-lock-button"

const UNAUTHENTICATED_PATHS = ["/login", "/setup"]

const navItems = [
  { to: "/", label: "Pills", icon: FolderKanbanIcon },
  { to: "/settings/cloudflare", label: "Cloudflare", icon: CloudIcon },
  { to: "/settings/runtime", label: "Runtime", icon: SettingsIcon },
  { to: "/sessions", label: "Sessions", icon: KeyRoundIcon },
] as const

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (UNAUTHENTICATED_PATHS.includes(pathname)) {
    return <>{children}</>
  }

  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1">
            <img
              src="/logo192.png"
              alt=""
              className="size-7 rounded-md"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">Upster</div>
              <div className="truncate text-xs text-muted-foreground">
                Tunnel control
              </div>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.to

                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton render={<Link to={item.to} />}>
                        <Icon data-icon="inline-start" />
                        <span>{item.label}</span>
                        {isActive && (
                          <span className="ml-auto size-1.5 rounded-full bg-primary" />
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex flex-col items-center gap-1 px-2 py-1 text-center text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="w-fit">
                Beta
              </Badge>
              <span>v{__APP_VERSION__}</span>
            </div>
            <a
              href="https://github.com/kerdofficial"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
                className="size-3"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              kerdofficial
            </a>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-2">
            <CloudflareLockButton />
            <LogoutButton />
          </div>
        </header>
        <main className="min-h-0 flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
