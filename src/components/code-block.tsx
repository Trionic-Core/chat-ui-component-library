import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '../utils/cn'
import type { CodeBlockProps } from '../types'

/**
 * Premium code block with dark background and clean styling.
 *
 * Design:
 * - Dark background (#1C1B19 light mode, #111010 dark mode)
 * - Clean rounded corners (radius-lg = 16px)
 * - Header with muted language badge and copy button
 * - Copy button shows "Copied!" with checkmark for 2s
 * - Monospace font with proper tab-size
 * - Horizontal scroll for long lines (no wrapping)
 * - Subtle border that blends with the content
 *
 * The code is rendered as text content (never HTML) to prevent XSS.
 */
export function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  showCopy = true,
  maxHeight = '400px',
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for environments without clipboard API
      const textarea = document.createElement('textarea')
      textarea.value = code
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    }
  }, [code])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const lines = code.split('\n')

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--cxc-radius-lg)] my-4',
        className
      )}
      style={{
        backgroundColor: 'var(--cxc-code-bg)',
      }}
    >
      {/* Header with language badge and copy button */}
      {(language || showCopy) && (
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{
            backgroundColor: 'var(--cxc-code-header-bg)',
          }}
        >
          <span
            className="text-xs font-medium tracking-wide"
            style={{
              color: 'var(--cxc-code-header-text)',
              fontFamily: 'var(--cxc-font-mono)',
            }}
          >
            {language ?? ''}
          </span>

          {showCopy && (
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-[var(--cxc-radius-sm)] text-xs',
                'transition-all duration-150',
                'hover:opacity-80 focus-visible:outline-none focus-visible:ring-2',
              )}
              style={{
                color: copied ? 'var(--cxc-success)' : 'var(--cxc-code-header-text)',
              }}
              aria-label={copied ? 'Copied' : 'Copy code'}
            >
              {copied ? (
                <>
                  <Check size={13} />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Code content */}
      <div
        className="overflow-auto cxc-scrollbar"
        style={{ maxHeight }}
      >
        <pre
          className="px-4 py-4 m-0 text-[13px] leading-[1.65]"
          style={{
            color: 'var(--cxc-code-text)',
            fontFamily: 'var(--cxc-font-mono)',
            tabSize: 2,
          }}
        >
          <code>
            {showLineNumbers
              ? lines.map((line, i) => (
                  <div key={i} className="flex">
                    <span
                      className="select-none pr-4 text-right"
                      style={{
                        color: 'var(--cxc-code-header-text)',
                        minWidth: `${String(lines.length).length + 1}ch`,
                        opacity: 0.6,
                      }}
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1">{line}</span>
                  </div>
                ))
              : code}
          </code>
        </pre>
      </div>
    </div>
  )
}
