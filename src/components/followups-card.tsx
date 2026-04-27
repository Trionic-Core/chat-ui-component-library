import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import { Check, Lock } from 'lucide-react'
import { cn } from '../utils/cn'
import type { FollowupsCardProps } from '../types'

const OTHER_LABEL = 'Other (specify)'

/**
 * FollowupsCard — render the agent's `suggest_followups` tool output as
 * an MCQ-style block of buttons, displayed below an assistant message.
 *
 * Design pattern:
 * - Single-select (multi=false): each option is a pill button. Clicking
 *   any one immediately submits and locks the card.
 * - Multi-select (multi=true): options become checkbox-style toggles with
 *   a "Continue" button that submits the union.
 * - "Other (specify)" is always the last option (appended by backend). It
 *   reveals a text input on selection; submitting commits the typed text.
 * - Once submitted, the card locks and visibly shows the chosen options.
 *
 * The card receives `lockedSelection` from the message state — the parent
 * (ChatMessage) reads `message.followupsSelection` to determine if the
 * card should render read-only.
 */
export function FollowupsCard({
  followups,
  lockedSelection,
  onSelect,
  className,
}: FollowupsCardProps) {
  // Locked = the prop is present (even as []). An empty array means "the user
  // moved past this turn without picking anything" — render the card disabled
  // but without any highlighted options. A non-empty array means the user
  // explicitly picked one or more options; those render highlighted.
  const isLocked = Array.isArray(lockedSelection)

  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [otherActive, setOtherActive] = useState(false)
  const [otherText, setOtherText] = useState('')
  const otherInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus the Other input when it opens.
  useEffect(() => {
    if (otherActive && otherInputRef.current) {
      otherInputRef.current.focus()
    }
  }, [otherActive])

  const lockedSet = useMemo(
    () => new Set(lockedSelection ?? []),
    [lockedSelection]
  )

  const submitSingle = useCallback(
    (option: string) => {
      if (isLocked) return
      if (option === OTHER_LABEL) {
        setOtherActive(true)
        return
      }
      onSelect([option])
    },
    [isLocked, onSelect]
  )

  const toggleMulti = useCallback(
    (option: string) => {
      if (isLocked) return
      if (option === OTHER_LABEL) {
        setOtherActive((prev) => !prev)
        return
      }
      setChecked((prev) => {
        const next = new Set(prev)
        if (next.has(option)) next.delete(option)
        else next.add(option)
        return next
      })
    },
    [isLocked]
  )

  const submitMulti = useCallback(() => {
    if (isLocked) return
    const picks: string[] = []
    for (const opt of followups.options) {
      if (opt === OTHER_LABEL) continue
      if (checked.has(opt)) picks.push(opt)
    }
    if (otherActive && otherText.trim()) {
      picks.push(otherText.trim())
    }
    if (picks.length === 0) return
    onSelect(picks)
  }, [isLocked, followups.options, checked, otherActive, otherText, onSelect])

  const submitOther = useCallback(() => {
    if (isLocked) return
    const t = otherText.trim()
    if (!t) return
    onSelect([t])
  }, [isLocked, otherText, onSelect])

  const hasMultiSelection =
    checked.size > 0 || (otherActive && otherText.trim().length > 0)

  return (
    <motion.div
      role="group"
      aria-label={followups.label}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        'mt-3 rounded-[var(--cxc-radius-lg)] px-3.5 py-3',
        className
      )}
      style={{
        backgroundColor: 'var(--cxc-bg-subtle)',
        border: '1px solid var(--cxc-border-subtle)',
      }}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p
          className="text-[12px] font-medium tracking-wide uppercase"
          style={{ color: 'var(--cxc-text-muted)' }}
        >
          {followups.label}
        </p>
        {isLocked && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium leading-none"
            style={{ color: 'var(--cxc-text-muted)' }}
          >
            <Lock size={11} strokeWidth={2.2} className="shrink-0 -mt-px" />
            <span className="leading-none">
              {lockedSelection && lockedSelection.length > 0 ? 'Selected' : 'Closed'}
            </span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {followups.options.map((opt) => {
          const isOther = opt === OTHER_LABEL
          const isChecked = followups.multi && checked.has(opt)
          const isLockedPick = lockedSet.has(opt)
          const isLockedOther =
            isLocked &&
            !lockedSet.has(opt) &&
            isOther === false &&
            // If the locked selection has an item that isn't in options, that
            // was an Other-typed value — we render the OTHER_LABEL pill as
            // un-picked and surface the typed value as a separate locked pill below.
            false

          return (
            <button
              key={opt}
              type="button"
              disabled={isLocked}
              onClick={() => (followups.multi ? toggleMulti(opt) : submitSingle(opt))}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px]',
                'transition-colors duration-100 outline-none',
                'focus-visible:ring-2 focus-visible:ring-[var(--cxc-border-focus)]',
                isLocked && 'cursor-default'
              )}
              style={{
                backgroundColor: isLockedPick
                  ? 'var(--cxc-accent-subtle, var(--cxc-bg-muted))'
                  : isChecked
                    ? 'var(--cxc-bg-muted)'
                    : 'var(--cxc-bg)',
                color: isLockedPick
                  ? 'var(--cxc-text)'
                  : 'var(--cxc-text-secondary)',
                border: `1px solid ${
                  isLockedPick
                    ? 'var(--cxc-border)'
                    : isChecked
                      ? 'var(--cxc-border)'
                      : 'var(--cxc-border-subtle)'
                }`,
                opacity: isLocked && !isLockedPick && !isLockedOther ? 0.5 : 1,
              }}
              onMouseOver={(e) => {
                if (isLocked) return
                e.currentTarget.style.backgroundColor = 'var(--cxc-bg-muted)'
                e.currentTarget.style.color = 'var(--cxc-text)'
              }}
              onMouseOut={(e) => {
                if (isLocked) return
                e.currentTarget.style.backgroundColor = isChecked
                  ? 'var(--cxc-bg-muted)'
                  : 'var(--cxc-bg)'
                e.currentTarget.style.color = 'var(--cxc-text-secondary)'
              }}
            >
              {followups.multi && !isOther && (
                <span
                  aria-hidden
                  className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px]"
                  style={{
                    border: `1px solid ${isChecked ? 'var(--cxc-text)' : 'var(--cxc-border)'}`,
                    backgroundColor: isChecked ? 'var(--cxc-text)' : 'transparent',
                  }}
                >
                  {isChecked && (
                    <Check size={9} strokeWidth={3} style={{ color: 'var(--cxc-bg)' }} />
                  )}
                </span>
              )}
              <span>{opt}</span>
            </button>
          )
        })}
      </div>

      {/* Locked-selection: render typed-Other text as its own pill if not already in options */}
      {isLocked && lockedSelection && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lockedSelection
            .filter((s) => !followups.options.includes(s))
            .map((s) => (
              <span
                key={s}
                className="inline-flex items-center rounded-full px-3 py-1.5 text-[13px]"
                style={{
                  backgroundColor: 'var(--cxc-bg-muted)',
                  color: 'var(--cxc-text)',
                  border: '1px solid var(--cxc-border)',
                }}
              >
                {s}
              </span>
            ))}
        </div>
      )}

      {/* "Other" text input (revealed on click) */}
      {!isLocked && otherActive && (
        <div className="mt-2.5 flex items-center gap-2">
          <input
            ref={otherInputRef}
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (followups.multi) submitMulti()
                else submitOther()
              }
              if (e.key === 'Escape') {
                setOtherActive(false)
                setOtherText('')
              }
            }}
            placeholder="Type your own…"
            className={cn(
              'flex-1 rounded-[var(--cxc-radius-md)] px-3 py-1.5 text-[13px]',
              'outline-none focus-visible:ring-2 focus-visible:ring-[var(--cxc-border-focus)]'
            )}
            style={{
              backgroundColor: 'var(--cxc-bg)',
              color: 'var(--cxc-text)',
              border: '1px solid var(--cxc-border)',
            }}
          />
          {!followups.multi && (
            <button
              type="button"
              onClick={submitOther}
              disabled={!otherText.trim()}
              className={cn(
                'rounded-full px-3 py-1.5 text-[13px] font-medium',
                'transition-opacity duration-100',
                otherText.trim() ? 'opacity-100' : 'opacity-40 cursor-not-allowed'
              )}
              style={{
                backgroundColor: 'var(--cxc-text)',
                color: 'var(--cxc-bg)',
              }}
            >
              Send
            </button>
          )}
        </div>
      )}

      {/* Multi-select submit button */}
      {!isLocked && followups.multi && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={submitMulti}
            disabled={!hasMultiSelection}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[13px] font-medium',
              'transition-opacity duration-100',
              hasMultiSelection ? 'opacity-100' : 'opacity-40 cursor-not-allowed'
            )}
            style={{
              backgroundColor: 'var(--cxc-text)',
              color: 'var(--cxc-bg)',
            }}
          >
            Continue
          </button>
        </div>
      )}
    </motion.div>
  )
}
