import type { ReactNode } from "react"
import { useRouterState } from "@tanstack/react-router"

import { SidebarToggle } from "@/components/layout"
import { EventsListener } from "@/features/events/events-listener"
import { cn } from "@/lib/utils"
import { Sidebar, useSidebarWidth } from "./sidebar"
import { useWindowChrome, WindowChromeProvider } from "./window-chrome"

const UNAUTHENTICATED_PATHS = ["/login", "/setup", "/pair"]

function Shell({ children }: { children: ReactNode }) {
  const { collapsed, narrow, closeSidebar } = useWindowChrome()
  const { width, resizing, handle } = useSidebarWidth()

  return (
    <div className="relative flex h-full">
      <EventsListener />
      {narrow ? (
        <>
          <div
            aria-hidden
            onClick={closeSidebar}
            className={cn(
              "fixed inset-0 z-20 bg-background/55 backdrop-blur-md transition-opacity duration-300 ease-drawer",
              collapsed ? "pointer-events-none opacity-0" : "opacity-100"
            )}
          />
          <div
            inert={collapsed}
            className={cn(
              "fixed inset-y-0 left-0 z-20 w-72 max-w-[85vw] shadow-float transition-transform duration-300 ease-drawer",
              collapsed && "-translate-x-full"
            )}
          >
            <Sidebar onNavigate={closeSidebar} />
          </div>
        </>
      ) : (
        <div
          className={cn(
            "relative shrink-0 overflow-hidden",
            !resizing && "transition-[width] duration-300 ease-drawer"
          )}
          style={{ width: collapsed ? 0 : width }}
          inert={collapsed}
        >
          <div className="h-full" style={{ width }}>
            <Sidebar onNavigate={() => undefined} />
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize"
            {...handle}
          />
        </div>
      )}
      <main className="min-w-0 flex-1 bg-background shadow-[inset_0.5px_0_0_var(--upster-hairline-strong)]">
        {children}
      </main>
      <div className="absolute top-[9px] left-(--toggle-left) z-30 no-drag">
        <SidebarToggle />
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (UNAUTHENTICATED_PATHS.includes(pathname)) {
    return (
      <div className="relative h-full overflow-y-auto bg-background">
        <div className="fixed inset-x-0 top-0 z-10 hidden h-(--toolbar-height) drag-region desktop:block" />
        {children}
      </div>
    )
  }

  return (
    <WindowChromeProvider>
      <Shell>{children}</Shell>
    </WindowChromeProvider>
  )
}
