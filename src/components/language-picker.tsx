import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, Globe, Search } from 'lucide-react'
import { cn } from '../utils/cn'
import { useChatContext } from '../context/chat-context'
import {
  compactLabel,
  filterLanguages,
  findOption,
  frequentOptions,
  matchesAutodetect,
  secondaryLabel,
} from '../utils/language'
import type { LanguageOption, LanguagePickerProps } from '../types'

/** Panel width. Fits inside ChatWidget's 440px shell with room to spare. */
const PANEL_WIDTH = 280
/** Panel cap. Leaves the input and a slice of transcript visible in a 620px widget. */
const PANEL_MAX_HEIGHT = 320
/** Breathing room kept between the panel and the edge of its container. */
const PANEL_EDGE_GAP = 8

/** A keyboard-reachable line in the panel. `locale: null` is the auto-detect row. */
interface PickerRow {
  key: string
  locale: string | null
  option?: LanguageOption
  /** Position across all sections. Assigned once, so rendering never rescans. */
  index: number
}

/** A titled run of rows. The heading is decorative; only rows take focus. */
interface PickerSection {
  key: string
  label?: string
  rows: PickerRow[]
}

/**
 * Dictation language picker — a compact trigger beside the mic that opens a
 * searchable list of the install's speech locales.
 *
 * This is a feature, not a workaround, but it does have a hard job on some
 * installs: an Azure region without fast transcription can only transcribe one
 * language at a time, and falls back to the first configured locale when the
 * caller names none — which is how an English sentence comes back written in
 * Gujarati script. There, picking a language is the only way to be understood.
 *
 * Renders nothing unless ChatConfig.voiceStatus supplies locales and there is
 * more than one thing to choose between, so installs that never configured
 * voice — and single-locale installs, which have no choice to offer — see
 * exactly what they see today.
 */
export function LanguagePicker({ disabled, size = 'md', className }: LanguagePickerProps) {
  const { config, dictation, dictationOptions, setDictationLanguage } = useChatContext()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  // null until measured — see the nudge effect below.
  const [shift, setShift] = useState<number | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const baseId = useId()
  const listboxId = `${baseId}-listbox`
  const reduceMotion = useReducedMotion()

  const candidates = config.voiceStatus?.autodetect_candidates
  const selected = findOption(dictationOptions, dictation.language)
  const showAutodetect = dictation.autodetectAvailable

  // Sectioned while browsing, flat while searching: a query that matches a
  // frequent language would otherwise show the same row under two headings.
  const sections = useMemo<PickerSection[]>(() => {
    // One counter across every section, so arrow keys cross section boundaries
    // without any of them knowing where they sit.
    let index = 0
    const row = (prefix: string, option?: LanguageOption): PickerRow => ({
      key: `${prefix}-${option?.locale ?? 'auto'}`,
      locale: option?.locale ?? null,
      option,
      index: index++,
    })

    const autoRows = showAutodetect && matchesAutodetect(query) ? [row('auto')] : []

    const trimmed = query.trim()
    if (trimmed) {
      const matches = filterLanguages(dictationOptions, trimmed)
      return [{ key: 'results', rows: [...autoRows, ...matches.map((option) => row('r', option))] }]
    }

    const frequent = frequentOptions(dictationOptions, candidates)
    const browsing: PickerSection[] = []
    if (autoRows.length) browsing.push({ key: 'auto', rows: autoRows })

    // The full list repeats the frequent few on purpose — a user scrolling
    // "All languages" for one of them should find it there.
    const grouped = frequent.length > 0 && frequent.length < dictationOptions.length
    if (grouped) {
      browsing.push({ key: 'frequent', label: 'Frequent', rows: frequent.map((option) => row('f', option)) })
    }
    browsing.push({
      key: 'all',
      label: grouped ? 'All languages' : undefined,
      rows: dictationOptions.map((option) => row('a', option)),
    })
    return browsing
  }, [dictationOptions, candidates, query, showAutodetect])

  const rows = useMemo(() => sections.flatMap((section) => section.rows), [sections])
  const activeRow = rows[activeIndex]
  const activeOptionId = activeRow ? `${baseId}-${activeRow.key}` : undefined

  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    setQuery('')
    if (refocus) triggerRef.current?.focus()
  }, [])

  const choose = useCallback(
    (locale: string | null) => {
      setDictationLanguage(locale)
      close(true)
    },
    [setDictationLanguage, close]
  )

  // Open on the current selection rather than the top of 153 rows.
  const openPanel = useCallback(() => {
    const current = rows.findIndex((row) => row.locale === dictation.language)
    setActiveIndex(current >= 0 ? current : 0)
    setOpen(true)
  }, [rows, dictation.language])

  // Every keystroke reshuffles the list, so the highlight follows the query
  // back to the best match instead of pointing at whatever now sits at that
  // index. Done here rather than in an effect on `query`, which would also fire
  // on open and undo the jump to the current selection.
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    setActiveIndex(0)
  }, [])

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  // Nudge the panel back inside its container if anchoring it to the trigger
  // would push it past the right edge. ChatWidget and ChatContainer both clip
  // overflow to keep their rounded corners, so a panel that spills is not
  // merely ugly — it is invisible. Measured rather than assumed, because the
  // widget is sized by the consumer.
  useEffect(() => {
    if (!open) {
      setShift(null)
      return
    }
    const panel = panelRef.current
    if (!panel) return

    const bounds = rootRef.current?.closest('.cxc-root')?.getBoundingClientRect()
    const rect = panel.getBoundingClientRect()
    const right = bounds ? bounds.right : window.innerWidth
    const left = bounds ? bounds.left : 0

    const overflow = rect.right - (right - PANEL_EDGE_GAP)
    // Never trade a right-edge overflow for a left-edge one.
    const room = Math.max(0, rect.left - (left + PANEL_EDGE_GAP))
    setShift(overflow > 0 ? -Math.min(overflow, room) : 0)
  }, [open])

  // Close on outside click, deferred a tick so the click that opened the panel
  // does not immediately close it.
  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close(false)
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [open, close])

  // Keep the active row visible by scrolling the list itself. scrollIntoView
  // would walk up and scroll the host page too, which an embedded widget must
  // never do to the page it is sitting on.
  useEffect(() => {
    const list = listRef.current
    if (!open || !list) return
    const row = list.querySelector<HTMLElement>('[data-active="true"]')
    if (!row) return
    if (row.offsetTop < list.scrollTop) {
      list.scrollTop = row.offsetTop
    } else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight
    }
  }, [open, activeIndex, rows])

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          if (rows.length) setActiveIndex((index) => (index + 1) % rows.length)
          break
        case 'ArrowUp':
          event.preventDefault()
          if (rows.length) setActiveIndex((index) => (index - 1 + rows.length) % rows.length)
          break
        case 'Home':
          event.preventDefault()
          setActiveIndex(0)
          break
        case 'End':
          event.preventDefault()
          setActiveIndex(Math.max(0, rows.length - 1))
          break
        case 'Enter':
          event.preventDefault()
          if (activeRow) choose(activeRow.locale)
          break
        case 'Escape':
          event.preventDefault()
          // Escape closes the innermost thing first — the widget's own handlers
          // must not also act on it.
          event.stopPropagation()
          close(true)
          break
        case 'Tab':
          // Focus the trigger synchronously and let the default Tab run from
          // there, so the user lands on the next control in the input row. Left
          // to itself, Tab would advance from an input that is about to unmount
          // and drop focus on the body.
          close(true)
          break
      }
    },
    [rows.length, activeRow, choose, close]
  )

  // Nothing to choose between is not a choice: one locale and no auto-detect
  // means the trigger would only ever confirm what already happens.
  const selectableCount = dictationOptions.length + (showAutodetect ? 1 : 0)
  if (!config.voice || dictationOptions.length === 0 || selectableCount < 2) return null

  const triggerLabel = selected ? compactLabel(selected) : 'Auto'
  const triggerTitle = selected
    ? `Dictation language: ${selected.englishName}`
    : 'Dictation language: auto-detect'
  const dimension = size === 'sm' ? 'h-7' : 'h-8'
  const iconSize = size === 'sm' ? 13 : 14

  return (
    <div ref={rootRef} className={cn('relative flex items-center', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close(false) : openPanel())}
        disabled={disabled}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-full px-2',
          dimension,
          'text-[12px] leading-none',
          'transition-colors duration-100',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-[var(--cxc-border-focus)]',
          'disabled:cursor-not-allowed disabled:opacity-40'
        )}
        style={{
          color: open ? 'var(--cxc-text)' : 'var(--cxc-text-secondary)',
          border: '1px solid var(--cxc-border)',
          backgroundColor: open ? 'var(--cxc-bg-muted)' : 'transparent',
        }}
        onMouseOver={(e) => {
          if (open) return
          e.currentTarget.style.backgroundColor = 'var(--cxc-bg-muted)'
          e.currentTarget.style.color = 'var(--cxc-text)'
        }}
        onMouseOut={(e) => {
          if (open) return
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = 'var(--cxc-text-secondary)'
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={triggerTitle}
        title={triggerTitle}
      >
        <Globe size={iconSize} strokeWidth={1.8} aria-hidden="true" />
        <span className="max-w-[72px] truncate">{triggerLabel}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.14, ease: [0.25, 0.1, 0.25, 1] }}
            // Safety net for a click that landed on the panel chrome rather than
            // a row: Escape still closes, wherever focus ended up inside.
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                close(true)
              }
            }}
            className="absolute bottom-full z-50 mb-2 flex flex-col overflow-hidden rounded-[var(--cxc-radius-lg)] shadow-lg"
            style={{
              // Opens upward: the input sits at the bottom of the widget, so a
              // downward panel would spill straight out of the container.
              left: shift ?? 0,
              // Hidden for the one frame before the nudge is measured, so the
              // panel never appears in the wrong place — including for readers
              // who have animation turned off.
              visibility: shift === null ? 'hidden' : 'visible',
              width: `min(${PANEL_WIDTH}px, calc(100vw - 2rem))`,
              maxHeight: PANEL_MAX_HEIGHT,
              backgroundColor: 'var(--cxc-bg)',
              border: '1px solid var(--cxc-border)',
            }}
          >
            <div
              className="flex shrink-0 items-center gap-2 px-3 py-2"
              style={{ borderBottom: '1px solid var(--cxc-border-subtle)' }}
            >
              <Search size={14} strokeWidth={1.8} style={{ color: 'var(--cxc-text-muted)' }} aria-hidden="true" />
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search languages"
                autoComplete="off"
                spellCheck={false}
                aria-label="Search dictation languages"
                aria-expanded
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={activeOptionId}
                className={cn(
                  'w-full bg-transparent text-[13px] leading-5 outline-none',
                  'placeholder:text-[var(--cxc-text-muted)]'
                )}
                style={{ color: 'var(--cxc-text)' }}
              />
            </div>

            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label="Dictation language"
              className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
            >
              {rows.length === 0 && (
                <p className="px-3 py-4 text-center text-[12px]" style={{ color: 'var(--cxc-text-muted)' }}>
                  No languages match
                </p>
              )}

              {sections.map((section) => (
                <div key={section.key}>
                  {section.label && (
                    <p
                      className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide"
                      style={{ color: 'var(--cxc-text-muted)' }}
                      aria-hidden="true"
                    >
                      {section.label}
                    </p>
                  )}
                  {section.rows.map((row) => {
                    const isActive = row.index === activeIndex
                    const isSelected = row.locale === dictation.language
                    const secondary = row.option ? secondaryLabel(row.option) : ''
                    return (
                      <div
                        key={row.key}
                        id={`${baseId}-${row.key}`}
                        role="option"
                        aria-selected={isSelected}
                        aria-label={row.option ? `${row.option.nativeName} — ${row.option.englishName}` : undefined}
                        data-active={isActive}
                        onClick={() => choose(row.locale)}
                        onMouseMove={() => {
                          if (row.index !== activeIndex) setActiveIndex(row.index)
                        }}
                        className="flex cursor-pointer items-baseline gap-1.5 px-3 py-1.5"
                        style={{ backgroundColor: isActive ? 'var(--cxc-bg-muted)' : 'transparent' }}
                      >
                        {/* The endonym is the language's identity, so it keeps
                            its width and the English gloss absorbs truncation. */}
                        <span
                          className="max-w-[60%] shrink-0 truncate text-[13px]"
                          style={{ color: 'var(--cxc-text)' }}
                        >
                          {row.option ? row.option.nativeName : 'Auto-detect'}
                        </span>
                        {secondary && (
                          <span
                            className="min-w-0 flex-1 truncate text-[11px]"
                            style={{ color: 'var(--cxc-text-muted)' }}
                          >
                            {secondary}
                          </span>
                        )}
                        {isSelected && (
                          <Check
                            size={13}
                            strokeWidth={2.2}
                            className="ml-auto shrink-0 self-center"
                            style={{ color: 'var(--cxc-text)' }}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
