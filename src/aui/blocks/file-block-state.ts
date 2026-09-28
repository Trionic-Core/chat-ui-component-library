import type { FileBlock } from '../aui-types'
import type { FileStatus } from '../file-handler'

/* ------------------------------------------------------------------
 * File card logic — the state decision, the poll schedule and the
 * text. Pure, so it is tested without a DOM.
 *
 * The rules are docs/CHAT_FILE_EXPORTS.md §2 in the backend repo. The
 * block gives the state when it was sent; the latest status read and a
 * refusal from either file route move it on.
 * ----------------------------------------------------------------*/

export type FileCardState = 'preparing' | 'ready' | 'failed' | 'expired'

/** A terminal answer from a file route: 404 (no file for this caller) or 410 (gone). */
export type FileRefusal = 404 | 410

/** Poll every 2 s for the first 30 s, then every 10 s. */
export const FAST_POLL_MS = 2_000
export const FAST_POLL_WINDOW_MS = 30_000
export const SLOW_POLL_MS = 10_000

/** A failed status with no sentence of its own. */
export const FAILED_TEXT = 'The file could not be created.'
export const UNAVAILABLE_TEXT = 'This file is not available.'

const STATUSES: ReadonlySet<unknown> = new Set(['preparing', 'ready', 'failed', 'expired'])

/** What the card shows: the block, updated by the latest status read. */
export interface FileView {
  state: FileCardState
  sizeBytes: number | null
  rowCount: number | null
  truncated: boolean
  expiresAt: string
  /** The sentence for a failed file; null in every other state. */
  error: string | null
}

/** The delay before the next status read, `elapsedMs` after polling started. */
export function nextPollDelayMs(elapsedMs: number): number {
  return elapsedMs < FAST_POLL_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS
}

/** The card polls only while the file is preparing: ready, failed and expired are final. */
export function keepsPolling(state: FileCardState): boolean {
  return state === 'preparing'
}

/**
 * Milliseconds since the epoch, or NaN. The backend sends microseconds
 * (`.123456`), which the ECMAScript date format does not define, so the
 * fraction is cut to milliseconds before the parse.
 */
function parseTime(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'))
}

/**
 * True once `expiresAt` is at or before `now`, the server's own rule. An
 * unreadable time never expires the card; the download's 410 still does.
 */
export function isExpired(expiresAt: string, now: number): boolean {
  const at = parseTime(expiresAt)
  return Number.isFinite(at) && at <= now
}

/** The status route answered with a body the card can read. */
export function isFileStatus(value: unknown): value is FileStatus {
  if (typeof value !== 'object' || value === null) return false
  const body = value as Record<string, unknown>
  return STATUSES.has(body.status) && typeof body.expires_at === 'string'
}

/** The terminal HTTP code a host rejected with, read from the error's `status`. */
export function refusalOf(error: unknown): FileRefusal | null {
  const code = (error as { status?: unknown } | null)?.status
  return code === 404 || code === 410 ? code : null
}

/**
 * Decide what the card shows. A past `expires_at` or a 410 wins over every
 * other state, as it does on the server: a failed file past its date is
 * expired, not failed. Otherwise the latest read (which may itself say
 * `expired`) wins over the state the block was sent with.
 */
export function fileView(
  block: FileBlock,
  status: FileStatus | null,
  refusal: FileRefusal | null,
  now: number,
): FileView {
  const expiresAt = status?.expires_at ?? block.expires_at
  const facts = {
    sizeBytes: status?.size_bytes ?? block.size_bytes ?? null,
    rowCount: status?.row_count ?? block.row_count ?? null,
    truncated: status?.truncated ?? block.truncated ?? false,
    expiresAt,
  }
  if (refusal === 410 || isExpired(expiresAt, now)) {
    return { ...facts, state: 'expired', error: null }
  }
  if (refusal === 404) return { ...facts, state: 'failed', error: UNAVAILABLE_TEXT }
  const state = status?.status ?? block.status
  if (state === 'failed') return { ...facts, state, error: status?.error || FAILED_TEXT }
  return { ...facts, state, error: null }
}

/* ------------------------------ Text ----------------------------- */

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const
const ONE_DECIMAL = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** "512 B", "1.5 KB", "471 KB", "4.1 MB" — one decimal below 10 units. Null when unknown. */
export function formatFileSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit > 0 && value < 10 ? ONE_DECIMAL : WHOLE
  return `${digits.format(value)} ${SIZE_UNITS[unit]}`
}

/** "12,840 rows", or "First 100,000 rows" when the export stopped at its row limit. */
export function formatRowCount(rowCount: number | null, truncated: boolean): string | null {
  if (rowCount === null || !Number.isFinite(rowCount) || rowCount < 0) return null
  const count = WHOLE.format(rowCount)
  if (truncated) return `First ${count} rows`
  return rowCount === 1 ? '1 row' : `${count} rows`
}

/** "Oct 27, 2026" in the reader's time zone, or null for an unreadable time. */
export function formatExpiry(expiresAt: string): string | null {
  const at = parseTime(expiresAt)
  return Number.isFinite(at) ? DATE.format(at) : null
}

/** "CSV · 471 KB · 12,840 rows". The row count is a CSV fact only. */
export function fileMeta(format: string, view: FileView): string {
  return [
    format.toUpperCase(),
    formatFileSize(view.sizeBytes),
    format === 'csv' ? formatRowCount(view.rowCount, view.truncated) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
