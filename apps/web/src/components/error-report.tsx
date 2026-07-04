"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { LogOutput } from "@/components/log-output"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type ErrorReportContextValue = {
  openDetail: (message: string) => void
}

const ErrorReportContext = createContext<ErrorReportContextValue | null>(null)

export function ErrorReportProvider({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState<string | null>(null)

  return (
    <ErrorReportContext.Provider value={{ openDetail: setDetail }}>
      {children}
      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Error details</DialogTitle>
            <DialogDescription>
              The action could not be completed.
            </DialogDescription>
          </DialogHeader>
          {detail !== null ? <LogOutput text={detail} /> : null}
        </DialogContent>
      </Dialog>
    </ErrorReportContext.Provider>
  )
}

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

export function useErrorReporter() {
  const context = useContext(ErrorReportContext)
  const navigate = useNavigate()

  return function reportError(
    err: unknown,
    options: { fallback: string; pillId?: string }
  ) {
    const message = getErrorMessage(err, options.fallback)
    const pillId = options.pillId

    if (pillId) {
      toast.error(message, {
        action: {
          label: "View diagnostics",
          onClick: () =>
            void navigate({
              to: "/pills/$pillId",
              params: { pillId },
              search: { tab: "diagnostics" },
            }),
        },
      })
      return
    }

    toast.error(message, {
      action: {
        label: "Details",
        onClick: () => context?.openDetail(message),
      },
    })
  }
}
