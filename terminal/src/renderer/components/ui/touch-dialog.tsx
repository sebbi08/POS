import * as React from "react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

interface TouchDialogProps {
  title: string
  onClose: () => void
  /** Only the PIN dialog closes on Escape; every other till dialog closes via its own button. */
  escapeCloses?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Modal dialog for the till. It is open while mounted, takes the focus itself
 * (so Windows never opens its touch keyboard and a hardware Enter presses no button),
 * and never closes on a tap outside, so an entered amount or a half-done cancellation is kept.
 */
function TouchDialog({ title, onClose, escapeCloses = false, className, children }: TouchDialogProps) {
  const contentRef = React.useRef<HTMLDivElement>(null)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        ref={contentRef}
        tabIndex={-1}
        // Radix hides the rest of the page but does not set aria-modal itself.
        aria-modal="true"
        aria-describedby={undefined}
        showCloseButton={false}
        className={className}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          contentRef.current?.focus()
        }}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (!escapeCloses) e.preventDefault()
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export { TouchDialog }
