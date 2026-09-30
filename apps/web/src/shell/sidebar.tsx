import { useEffect, useRef, useState, type PointerEvent } from "react"
import { Link } from "@tanstack/react-router"
import {
  ChevronsUpDownIcon,
  CloudIcon,
  ExternalLinkIcon,
  FolderKanbanIcon,
  KeyRoundIcon,
  LockIcon,
  LockOpenIcon,
  LogOutIcon,
  RadioTowerIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react"
import { scopesIncludeAll, type AccessScope } from "@upster/core"

import { BrandMark } from "@/components/brand-mark"
import { StatusDot } from "@/components/status"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useHasScopes, useScopes } from "@/features/auth/use-scopes"
import { useLogout } from "@/features/auth/use-logout"
import { useCloudflareVault } from "@/features/secrets/cloudflare-vault-provider"
import { useIsRemoteEnvironment } from "@/lib/environment"

const widthKey = "upster.sidebar-width"
const defaultWidth = 232
const clamp = (value: number) => Math.min(320, Math.max(200, value))

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  scope: AccessScope
}

const primary: ReadonlyArray<NavItem> = [
  { to: "/", label: "Pills", icon: FolderKanbanIcon, scope: "pills:read" },
]

const settings: ReadonlyArray<NavItem> = [
  {
    to: "/settings/cloudflare",
    label: "Cloudflare",
    icon: CloudIcon,
    scope: "vault:status",
  },
  {
    to: "/settings/runtime",
    label: "Runtime",
    icon: SettingsIcon,
    scope: "settings:read",
  },
  {
    to: "/sessions",
    label: "Sessions",
    icon: KeyRoundIcon,
    scope: "sessions:read",
  },
  {
    to: "/connections",
    label: "Remote Access",
    icon: RadioTowerIcon,
    scope: "connections:read",
  },
]

export function useSidebarWidth() {
  const [width, setWidth] = useState(defaultWidth)
  const [resizing, setResizing] = useState(false)
  const start = useRef<{ x: number; width: number } | null>(null)

  useEffect(() => {
    const stored = Number(localStorage.getItem(widthKey))
    if (stored) setWidth(clamp(stored))
  }, [])

  return {
    width,
    resizing,
    handle: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = { x: event.clientX, width }
        setResizing(true)
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        if (start.current) {
          setWidth(clamp(start.current.width + event.clientX - start.current.x))
        }
      },
      onPointerUp() {
        start.current = null
        setResizing(false)
        localStorage.setItem(widthKey, String(width))
      },
      onDoubleClick() {
        setWidth(defaultWidth)
        localStorage.removeItem(widthKey)
      },
    },
  }
}

function NavLink({
  item,
  onNavigate,
}: {
  item: NavItem
  onNavigate: () => void
}) {
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: true }}
      onClick={onNavigate}
      className="group flex h-7 items-center gap-2.5 rounded-lg px-2.5 text-foreground outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/60 data-[status=active]:bg-sidebar-accent"
    >
      <Icon
        className="size-4 text-muted-foreground group-data-[status=active]:text-brand"
        aria-hidden
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function AccountMenu() {
  const { isUnlocked, requestUnlock, lock } = useCloudflareVault()
  const canUnlock = useHasScopes("vault:unlock")
  const { signOut, pending } = useLogout()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/60 aria-expanded:bg-foreground/5"
        aria-label="Upster menu"
      >
        <BrandMark className="size-7" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">Upster</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {canUnlock ? (
              <>
                <StatusDot tone={isUnlocked ? "success" : "idle"} />
                {isUnlocked ? "Vault unlocked" : "Vault locked"}
              </>
            ) : (
              <>v{__APP_VERSION__}</>
            )}
          </span>
        </span>
        <ChevronsUpDownIcon
          className="size-3.5 text-muted-foreground"
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Upster v{__APP_VERSION__}</DropdownMenuLabel>
        </DropdownMenuGroup>
        {canUnlock ? (
          <DropdownMenuItem
            onClick={() => {
              if (isUnlocked) {
                void lock()
                return
              }
              requestUnlock()
            }}
          >
            {isUnlocked ? <LockIcon /> : <LockOpenIcon />}
            {isUnlocked ? "Lock Cloudflare vault" : "Unlock Cloudflare vault"}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          render={
            <a
              href="https://github.com/kerdofficial"
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <ExternalLinkIcon />
          GitHub
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onClick={() => void signOut()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const scopes = useScopes()
  const remote = useIsRemoteEnvironment()
  const visible = (items: ReadonlyArray<NavItem>) =>
    items.filter(
      (item) => scopes === null || scopesIncludeAll(scopes, [item.scope])
    )
  const settingsItems = visible(settings)

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-(--toolbar-height) shrink-0 items-center gap-2 pr-3 pl-13 drag-region mac-desktop:hidden">
        <BrandMark className="size-5" />
        <span className="truncate font-heading font-medium">Upster</span>
      </div>
      <div className="hidden h-(--toolbar-height) shrink-0 drag-region mac-desktop:block" />
      <nav
        aria-label="Main"
        className="flex flex-col gap-0.5 overflow-y-auto px-2.5 pt-1.5"
      >
        {visible(primary).map((item) => (
          <NavLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}
        {settingsItems.length > 0 ? (
          <>
            <p className="px-2.5 pt-5 pb-1.5 text-xs font-semibold text-muted-foreground">
              Settings
            </p>
            {settingsItems.map((item) => (
              <NavLink key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </>
        ) : null}
      </nav>
      <div className="mt-auto flex flex-col gap-1 p-2.5">
        {remote ? (
          <p className="flex items-center gap-2 px-2.5 pb-1 text-xs text-muted-foreground">
            <RadioTowerIcon className="size-3.5" aria-hidden />
            Remote environment
          </p>
        ) : null}
        <AccountMenu />
      </div>
    </div>
  )
}
