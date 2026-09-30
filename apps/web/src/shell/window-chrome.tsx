import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "@tanstack/react-router"

import { useIsMobile } from "@/hooks/use-mobile"
import { getDesktopBridge } from "@/lib/desktop"

const storageKey = "upster.sidebar"

const WindowChrome = createContext<{
  collapsed: boolean
  narrow: boolean
  toggleSidebar: () => void
  closeSidebar: () => void
} | null>(null)

export function WindowChromeProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const narrow = useIsMobile()
  const [preferCollapsed, setPreferCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    setPreferCollapsed(localStorage.getItem(storageKey) === "collapsed")
  }, [])

  function toggleSidebar() {
    if (narrow) {
      setDrawerOpen((value) => !value)
      return
    }
    setPreferCollapsed((value) => {
      localStorage.setItem(storageKey, value ? "open" : "collapsed")
      return !value
    })
  }

  const onToggle = useEffectEvent(toggleSidebar)
  const onNavigate = useEffectEvent((to: string) => {
    void router.navigate({ to })
  })

  useEffect(() => {
    return getDesktopBridge()?.onWindowEvent((event) => {
      if (event.type === "toggle-sidebar") onToggle()
      if (event.type === "fullscreen") {
        document.documentElement.toggleAttribute(
          "data-fullscreen",
          event.active
        )
      }
      if (event.type === "navigate") onNavigate(event.to)
    })
  }, [])

  useEffect(() => {
    if (getDesktopBridge()) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "b" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onToggle()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <WindowChrome
      value={{
        collapsed: narrow ? !drawerOpen : preferCollapsed,
        narrow,
        toggleSidebar,
        closeSidebar: () => setDrawerOpen(false),
      }}
    >
      {children}
    </WindowChrome>
  )
}

export function useWindowChrome() {
  const chrome = useContext(WindowChrome)
  if (!chrome) throw new Error("Missing window chrome.")
  return chrome
}
