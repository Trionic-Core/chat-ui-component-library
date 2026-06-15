import { type ReactNode, useCallback, useEffect, useRef } from 'react'

/* ------------------------------------------------------------------
 * Dialog — themed modal for the AUI chart/table expand views.
 *
 * Ported from the fde-console primitive, re-themed onto the library's
 * token system (cx-* bridges to cxc-*) so the panel reads correctly in
 * both light and dark.
 * ----------------------------------------------------------------*/

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--cxc-bg-overlay)' }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-3xl rounded-lg border"
        style={{
          borderColor: 'var(--cx-border)',
          backgroundColor: 'var(--cx-canvas)',
          boxShadow: 'var(--cxc-shadow-lg)',
        }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: 'var(--cx-border)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--cx-text-primary)' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 transition-colors focus:outline-none focus-visible:ring-2"
            style={{ color: 'var(--cx-text-muted)' }}
            aria-label="Close dialog"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
