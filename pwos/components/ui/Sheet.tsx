'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A bottom sheet. Native <dialog> so focus trapping, Escape and the top layer
 * come from the platform rather than from a dependency.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // Clicking the backdrop closes; clicking the panel does not.
        if (event.target === ref.current) onClose()
      }}
      aria-label={title}
      className={[
        'mt-auto mb-0 w-full max-w-lg rounded-t-2xl border border-border bg-surface-raised p-0',
        'text-ink backdrop:bg-black/40 sm:my-auto sm:rounded-2xl',
      ].join(' ')}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 px-2 text-sm text-ink-muted hover:text-ink"
        >
          Close
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
    </dialog>
  )
}
