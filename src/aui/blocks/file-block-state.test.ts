import { describe, expect, it } from 'vitest'
import type { FileBlock } from '../aui-types'
import type { FileStatus } from '../file-handler'
import {
  FAILED_TEXT,
  FAST_POLL_MS,
  SLOW_POLL_MS,
  UNAVAILABLE_TEXT,
  fileMeta,
  fileView,
  formatExpiry,
  formatFileSize,
  formatRowCount,
  isExpired,
  isFileStatus,
  keepsPolling,
  nextPollDelayMs,
  refusalOf,
  type FileCardState,
} from './file-block-state'

/* ------------------------------------------------------------------
 * The file card's rules, from docs/CHAT_FILE_EXPORTS.md §2: the poll
 * schedule and when it stops, the state the card shows, and its text.
 * ----------------------------------------------------------------*/

/** Noon UTC, so the expiry date reads the same in every time zone the suite runs in. */
const EXPIRES_AT = '2026-10-27T12:00:00.123456+00:00'
const EXPIRES_MS = Date.UTC(2026, 9, 27, 12, 0, 0, 123)
const BEFORE = EXPIRES_MS - 60_000
const AFTER = EXPIRES_MS + 60_000

const CSV: FileBlock = {
  type: 'file',
  file_id: '8a0c5c1e-2f7b-4d8e-9a51-3c6b0f1d2e44',
  file_name: 'Totals-by-region-20260927-1015.csv',
  format: 'csv',
  content_type: 'text/csv; charset=utf-8',
  status: 'preparing',
  size_bytes: null,
  row_count: null,
  truncated: false,
  expires_at: EXPIRES_AT,
  title: 'Totals by region',
}

function statusOf(overrides: Partial<FileStatus>): FileStatus {
  return {
    file_id: CSV.file_id,
    status: 'ready',
    file_name: CSV.file_name,
    format: 'csv',
    content_type: CSV.content_type,
    size_bytes: 482113,
    row_count: 12840,
    truncated: false,
    expires_at: '2026-10-27T12:00:00.123456Z',
    error_type: null,
    error: null,
    ...overrides,
  }
}

describe('nextPollDelayMs — every 2 s for 30 s, then every 10 s', () => {
  it('reads every 2 s inside the first 30 s', () => {
    expect(nextPollDelayMs(0)).toBe(FAST_POLL_MS)
    expect(nextPollDelayMs(2_000)).toBe(2_000)
    expect(nextPollDelayMs(29_999)).toBe(2_000)
  })

  it('slows to every 10 s from 30 s on', () => {
    expect(nextPollDelayMs(30_000)).toBe(SLOW_POLL_MS)
    expect(nextPollDelayMs(30_001)).toBe(10_000)
    expect(nextPollDelayMs(3_600_000)).toBe(10_000)
  })

  it('reads at mount, every 2 s up to 30 s, then every 10 s', () => {
    const readsAt: number[] = [0]
    while (readsAt.length < 18) {
      const last = readsAt[readsAt.length - 1]
      readsAt.push(last + nextPollDelayMs(last))
    }
    expect(readsAt.slice(0, 16)).toEqual(Array.from({ length: 16 }, (_, i) => i * 2_000))
    expect(readsAt.slice(15)).toEqual([30_000, 40_000, 50_000])
  })
})

describe('keepsPolling — stop on ready, failed or expired', () => {
  it.each<[FileCardState, boolean]>([
    ['preparing', true],
    ['ready', false],
    ['failed', false],
    ['expired', false],
  ])('%s -> %s', (state, polls) => {
    expect(keepsPolling(state)).toBe(polls)
  })
})

describe('isExpired — the server rule, expires_at <= now', () => {
  it('is false before the time and true at and after it', () => {
    expect(isExpired(EXPIRES_AT, EXPIRES_MS - 1)).toBe(false)
    expect(isExpired(EXPIRES_AT, EXPIRES_MS)).toBe(true)
    expect(isExpired(EXPIRES_AT, EXPIRES_MS + 1)).toBe(true)
  })

  it('reads the backend microsecond form and the Z form alike', () => {
    expect(isExpired('2026-10-27T12:00:00.123456Z', EXPIRES_MS)).toBe(true)
    expect(isExpired('2026-10-27T12:00:00.123456Z', EXPIRES_MS - 1)).toBe(false)
    expect(isExpired('2026-10-27T12:00:00+00:00', Date.UTC(2026, 9, 27, 12))).toBe(true)
  })

  it('never expires on a time it cannot read', () => {
    expect(isExpired('soon', AFTER)).toBe(false)
    expect(isExpired('', AFTER)).toBe(false)
  })
})

describe('fileView — the state the card shows', () => {
  it('shows the state the block was sent with before any read', () => {
    expect(fileView(CSV, null, null, BEFORE).state).toBe('preparing')
    expect(fileView({ ...CSV, status: 'ready' }, null, null, BEFORE).state).toBe('ready')
  })

  it('moves on to the latest status read', () => {
    expect(fileView(CSV, statusOf({ status: 'preparing' }), null, BEFORE).state).toBe('preparing')
    expect(fileView(CSV, statusOf({ status: 'ready' }), null, BEFORE).state).toBe('ready')
  })

  it('takes the size, rows and truncation from the read over the stored block', () => {
    const view = fileView(CSV, statusOf({ row_count: 100000, truncated: true }), null, BEFORE)
    expect(view).toMatchObject({ sizeBytes: 482113, rowCount: 100000, truncated: true })
  })

  it('shows the status route sentence for a failed file', () => {
    const sentence = 'The export queue is busy. Try again in a few minutes.'
    const view = fileView(CSV, statusOf({ status: 'failed', error: sentence }), null, BEFORE)
    expect(view).toMatchObject({ state: 'failed', error: sentence })
  })

  it('still says something when a failed status has no sentence', () => {
    expect(fileView(CSV, statusOf({ status: 'failed', error: null }), null, BEFORE).error).toBe(
      FAILED_TEXT,
    )
  })

  it('is expired when expires_at is in the past, with no read at all', () => {
    expect(fileView(CSV, null, null, AFTER).state).toBe('expired')
    expect(fileView({ ...CSV, status: 'ready' }, null, null, AFTER).state).toBe('expired')
  })

  it('is expired when the status route says so', () => {
    expect(fileView(CSV, statusOf({ status: 'expired' }), null, BEFORE).state).toBe('expired')
  })

  it('is expired when a route answered 410', () => {
    expect(fileView({ ...CSV, status: 'ready' }, null, 410, BEFORE).state).toBe('expired')
  })

  it('lets expiry win over a failure, as the server does', () => {
    expect(fileView(CSV, statusOf({ status: 'failed', error: 'x' }), null, AFTER)).toMatchObject({
      state: 'expired',
      error: null,
    })
    expect(fileView(CSV, null, 404, AFTER).state).toBe('expired')
  })

  it('reads the expiry from the latest status over the stored block', () => {
    const extended = statusOf({ status: 'ready', expires_at: '2027-01-01T00:00:00Z' })
    expect(fileView(CSV, extended, null, AFTER).state).toBe('ready')
  })

  it('is failed and not available when a route answered 404', () => {
    expect(fileView(CSV, null, 404, BEFORE)).toMatchObject({
      state: 'failed',
      error: UNAVAILABLE_TEXT,
    })
  })
})

describe('isFileStatus — a body the card can read', () => {
  it('accepts the §3 body', () => {
    expect(isFileStatus(statusOf({}))).toBe(true)
  })

  it('rejects a body without a known status or an expiry', () => {
    expect(isFileStatus(statusOf({ status: 'queued' as FileStatus['status'] }))).toBe(false)
    expect(isFileStatus({ status: 'ready' })).toBe(false)
    expect(isFileStatus(null)).toBe(false)
    expect(isFileStatus('ready')).toBe(false)
  })
})

describe('refusalOf — the terminal HTTP code of a rejection', () => {
  it('reads 404 and 410 from the error status', () => {
    expect(refusalOf(Object.assign(new Error('Gone'), { status: 410 }))).toBe(410)
    expect(refusalOf({ status: 404 })).toBe(404)
  })

  it('treats every other rejection as one the reader can retry', () => {
    expect(refusalOf(Object.assign(new Error('Busy'), { status: 429 }))).toBeNull()
    expect(refusalOf({ status: '410' })).toBeNull()
    expect(refusalOf(new TypeError('Failed to fetch'))).toBeNull()
    expect(refusalOf(undefined)).toBeNull()
    expect(refusalOf(null)).toBeNull()
  })
})

describe('formatFileSize', () => {
  it('prints bytes, then 1024-based units with one decimal below 10', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(482113)).toBe('471 KB')
    expect(formatFileSize(4.1 * 1024 * 1024)).toBe('4.1 MB')
    expect(formatFileSize(104857600)).toBe('100 MB')
    expect(formatFileSize(3 * 1024 ** 4)).toBe('3,072 GB')
  })

  it('prints nothing for an unknown or impossible size', () => {
    expect(formatFileSize(null)).toBeNull()
    expect(formatFileSize(-1)).toBeNull()
    expect(formatFileSize(Number.NaN)).toBeNull()
  })
})

describe('formatRowCount', () => {
  it('counts rows with grouping and a singular', () => {
    expect(formatRowCount(12840, false)).toBe('12,840 rows')
    expect(formatRowCount(1, false)).toBe('1 row')
    expect(formatRowCount(0, false)).toBe('0 rows')
  })

  it('says "First N rows" when the export stopped at its row limit', () => {
    expect(formatRowCount(100000, true)).toBe('First 100,000 rows')
  })

  it('prints nothing while the count is unknown', () => {
    expect(formatRowCount(null, true)).toBeNull()
  })
})

describe('formatExpiry', () => {
  it('prints a short date', () => {
    expect(formatExpiry(EXPIRES_AT)).toBe('Oct 27, 2026')
  })

  it('prints nothing for a time it cannot read', () => {
    expect(formatExpiry('next month')).toBeNull()
  })
})

describe('fileMeta', () => {
  it('joins the format, the size and the CSV row count', () => {
    const view = fileView(CSV, statusOf({}), null, BEFORE)
    expect(fileMeta('csv', view)).toBe('CSV · 471 KB · 12,840 rows')
  })

  it('shows the truncated row count', () => {
    const view = fileView(CSV, statusOf({ row_count: 100000, truncated: true }), null, BEFORE)
    expect(fileMeta('csv', view)).toBe('CSV · 471 KB · First 100,000 rows')
  })

  it('shows the format alone while a CSV is preparing', () => {
    expect(fileMeta('csv', fileView(CSV, null, null, BEFORE))).toBe('CSV')
  })

  it('never shows a row count on a report', () => {
    const pdf = { ...CSV, format: 'pdf' as const, status: 'ready' as const, size_bytes: 90112, row_count: 40 }
    expect(fileMeta('pdf', fileView(pdf, null, null, BEFORE))).toBe('PDF · 88 KB')
  })
})
