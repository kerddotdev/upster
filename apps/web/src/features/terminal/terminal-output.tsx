"use client"

import { useEffect, useRef, useState } from "react"

import { EmptyState } from "@/components/layout"
import type { RunLog } from "@/features/pills/types"

const MAX_HISTORY = 5000

const themes = {
  light: {
    background: "#fbfaf8",
    foreground: "#2b2926",
    cursor: "#c1124a",
    cursorAccent: "#fbfaf8",
    selectionBackground: "#f0d3dc",
    black: "#2b2926",
    red: "#c1124a",
    green: "#1f7a45",
    yellow: "#9a6700",
    blue: "#2358c4",
    magenta: "#8f3fb0",
    cyan: "#0e7490",
    white: "#d9d6d0",
    brightBlack: "#7a766f",
    brightRed: "#d92662",
    brightGreen: "#2a9358",
    brightYellow: "#b57a0a",
    brightBlue: "#3b70dd",
    brightMagenta: "#a755c9",
    brightCyan: "#1791b0",
    brightWhite: "#f2f0ec",
  },
  dark: {
    background: "#2a2e36",
    foreground: "#ece9e4",
    cursor: "#f4a3b1",
    cursorAccent: "#2a2e36",
    selectionBackground: "#4b4453",
    black: "#3a3f48",
    red: "#f27a92",
    green: "#7fd39b",
    yellow: "#e8c46a",
    blue: "#82a9f5",
    magenta: "#c79bec",
    cyan: "#6fd0e0",
    white: "#d9d6d0",
    brightBlack: "#7d8592",
    brightRed: "#ff94a8",
    brightGreen: "#9be6b3",
    brightYellow: "#f5d78a",
    brightBlue: "#a0c0ff",
    brightMagenta: "#dcb5f7",
    brightCyan: "#92e2ee",
    brightWhite: "#f7f5f1",
  },
} as const

function usePrefersDark() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const update = () => setDark(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  return dark
}

function normalizeTerminalChunk(chunk: string) {
  return chunk.replace(/\r?\n/g, "\r\n")
}

export function TerminalOutput({
  runId,
  initialLogs,
}: {
  runId: string | null
  initialLogs: Array<RunLog>
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<{
    write: (data: string) => void
    dispose: () => void
  } | null>(null)
  const [plainLogs, setPlainLogs] = useState(initialLogs)
  const [ghosttyReady, setGhosttyReady] = useState(false)
  const dark = usePrefersDark()
  const theme = themes[dark ? "dark" : "light"]
  const historyRef = useRef<Array<string>>([])

  useEffect(() => {
    historyRef.current = initialLogs.map((log) => log.chunk)
  }, [initialLogs])

  useEffect(() => {
    let disposed = false

    async function bootGhostty() {
      if (!containerRef.current) {
        return
      }

      try {
        const { init, Terminal, FitAddon } = await import("ghostty-web")
        await init()

        if (disposed || !containerRef.current) {
          return
        }

        const term = new Terminal({
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          theme,
        })
        const fit = new FitAddon()
        term.loadAddon(fit)
        term.open(containerRef.current)
        fit.fit()
        const resizeObserver = new ResizeObserver(() => fit.fit())
        resizeObserver.observe(containerRef.current)
        historyRef.current.forEach((chunk) =>
          term.write(normalizeTerminalChunk(chunk))
        )
        terminalRef.current = {
          write: (data) => term.write(normalizeTerminalChunk(data)),
          dispose: () => {
            resizeObserver.disconnect()
            term.dispose()
          },
        }
        setGhosttyReady(true)
      } catch {
        setGhosttyReady(false)
      }
    }

    void bootGhostty()

    return () => {
      disposed = true
      terminalRef.current?.dispose()
      terminalRef.current = null
    }
  }, [initialLogs, theme])

  useEffect(() => {
    if (!runId) {
      return
    }

    const source = new EventSource(`/api/runs/${runId}/terminal`)

    source.onmessage = (event) => {
      const log = JSON.parse(event.data) as RunLog
      terminalRef.current?.write(log.chunk)
      historyRef.current = [...historyRef.current, log.chunk].slice(
        -MAX_HISTORY
      )
      setPlainLogs((current) => [...current, log].slice(-300))
    }

    return () => source.close()
  }, [runId])

  if (!runId) {
    return (
      <div className="min-h-[20rem]">
        <EmptyState>
          No active run. Start the pill to stream live output.
        </EmptyState>
      </div>
    )
  }

  return (
    <div
      className="relative h-full min-h-[20rem] overflow-hidden rounded-2xl p-3 ring-1 ring-border"
      style={{ backgroundColor: theme.background }}
    >
      <div ref={containerRef} className="size-full" />
      {!ghosttyReady && (
        <pre
          className="absolute inset-3 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap"
          style={{ color: theme.foreground }}
        >
          {plainLogs.map((log) => log.chunk).join("")}
        </pre>
      )}
    </div>
  )
}
