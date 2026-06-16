import { type ReactNode, useCallback, useEffect, useRef } from 'react'

/* ------------------------------------------------------------------
 * Dialog — themed modal for the AUI chart/table expand views.
 *
 * Ported from the fde-console primitive, re-themed onto the library's
 * token system (cx-* bridges to cxc-*) so the panel reads correctly in
 * both light and dark.
 *
 * Focus management (no deps): on open, focus moves into the dialog (first
 * focusable element, else the panel itself); Tab/Shift+Tab are trapped
 * inside the panel; Escape closes; and focus is restored to the
 * previously-focused element on close.
 * ----------------------------------------------------------------*/

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // The element focused before the dialog opened, restored when it closes.
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const focusableElements = useCallback((): HTMLElement[] => {
    const panel = panelRef.current
    if (!panel) return []
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      // Trap focus: cycle within the panel's focusable elements.
      const focusables = focusableElements()
      if (focusables.length === 0) {
        // Nothing focusable inside — keep focus on the panel itself.
        e.preventDefault()
        panelRef.current?.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      if (e.shiftKey) {
        if (active === first || !panelRef.current?.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose, focusableElements],
  )

  // Lock scroll + bind the keydown handler while open.
  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, handleKeyDown])

  // Move focus into the dialog on open; restore it to the trigger on close.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    // Focus the first focusable child, else the panel container itself.
    const focusables = focusableElements()
    ;(focusables[0] ?? panelRef.current)?.focus()
    return () => {
      previouslyFocused.current?.focus?.()
    }
  }, [open, focusableElements])

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
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-3xl rounded-lg border focus:outline-none"
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
