// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileBlock } from '../aui-types'
import type { FileHandler, FileStatus } from '../file-handler'
import { FileBlockCard } from './file-block'

/* ------------------------------------------------------------------
 * The file card, mounted for real.
 *
 * Its polling and its button live in effects and events, which the node
 * environment never runs, so this file opts in to jsdom like the DOM hooks
 * do. file-block-state.test.ts proves the rules; this proves the card acts
 * on them: what each state renders, when the host is called and with what,
 * and that polling stops — on a final state and on unmount.
 * ----------------------------------------------------------------*/

const NOW = Date.UTC(2026, 8, 27, 10, 15)
const FUTURE = '2026-10-27T12:00:00.123456+00:00'
const PAST = '2026-09-01T12:00:00.123456+00:00'

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
  expires_at: FUTURE,
  title: 'Totals by region',
}

const READY_CSV: FileBlock = { ...CSV, status: 'ready', size_bytes: 482113, row_count: 12840 }

function statusOf(overrides: Partial<FileStatus> = {}): FileStatus {
  return {
    file_id: CSV.file_id,
    status: 'ready',
    file_name: CSV.file_name,
    format: 'csv',
    content_type: CSV.content_type,
    size_bytes: 482113,
    row_count: 12840,
    truncated: false,
    expires_at: FUTURE,
    error_type: null,
    error: null,
    ...overrides,
  }
}

/** A host adapter whose status answers come from `answers`, in order; the last one repeats. */
function fakeHost(answers: (FileStatus | Error)[] = [statusOf()]) {
  let index = 0
  const status = vi.fn(async (_block: FileBlock, _signal: AbortSignal) => {
    const answer = answers[Math.min(index, answers.length - 1)]
    index += 1
    if (answer instanceof Error) throw answer
    return answer
  })
  const download = vi.fn(async (_block: FileBlock) => {})
  return { status, download } satisfies FileHandler
}

function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

let container: HTMLDivElement
let root: Root

async function mount(block: FileBlock, files?: FileHandler) {
  await act(async () => {
    root.render(createElement(FileBlockCard, { block, files }))
  })
}

/** Move the fake clock and let every read that falls due settle. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function button(): HTMLButtonElement | null {
  return container.querySelector('button')
}

function text(): string {
  return container.textContent ?? ''
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(NOW)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('FileBlockCard — each state', () => {
  it('preparing: says so, with no button', async () => {
    await mount(CSV, fakeHost([statusOf({ status: 'preparing' })]))
    expect(text()).toContain('Totals by region')
    expect(text()).toContain('CSV')
    expect(text()).toContain('Preparing…')
    expect(button()).toBeNull()
  })

  it('ready: the details, the expiry date and a named Download button', async () => {
    await mount(READY_CSV, fakeHost())
    expect(text()).toContain('CSV · 471 KB · 12,840 rows')
    expect(text()).toContain('Available until Oct 27, 2026')
    expect(button()?.getAttribute('aria-label')).toBe(
      'Download Totals-by-region-20260927-1015.csv',
    )
    expect(button()?.textContent).toBe('Download')
  })

  it('ready and truncated: "First N rows"', async () => {
    await mount({ ...READY_CSV, row_count: 100000, truncated: true }, fakeHost())
    expect(text()).toContain('First 100,000 rows')
  })

  it('failed: the status route sentence, with no button', async () => {
    const sentence = 'The export queue is busy. Try again in a few minutes.'
    await mount(CSV, fakeHost([statusOf({ status: 'failed', error: sentence })]))
    expect(text()).toContain(sentence)
    expect(text()).not.toContain('Preparing…')
    expect(button()).toBeNull()
  })

  it('expired: "Expired" when expires_at is past, with no button and no read', async () => {
    const host = fakeHost()
    await mount({ ...READY_CSV, expires_at: PAST }, host)
    expect(text()).toContain('Expired')
    expect(button()).toBeNull()
    await mount({ ...CSV, expires_at: PAST }, host)
    expect(host.status).not.toHaveBeenCalled()
  })

  it('expired: "Expired" when the status route says so', async () => {
    await mount(CSV, fakeHost([statusOf({ status: 'expired' })]))
    expect(text()).toContain('Expired')
  })

  it('shows the file name when the block has no title, and keeps the full name in title', async () => {
    const long = `${'Quarterly-revenue-by-outlet-and-channel-'.repeat(3)}20260927.csv`
    await mount({ ...READY_CSV, title: null, file_name: long }, fakeHost())
    const name = container.querySelector('p.truncate')
    expect(name?.textContent).toBe(long)
    expect(name?.getAttribute('title')).toBe(long)
  })

  it('announces status changes politely', async () => {
    await mount(CSV, fakeHost([statusOf({ status: 'preparing' })]))
    const region = container.querySelector('[aria-live="polite"]')
    expect(region?.textContent).toBe('Preparing…')
  })
})

describe('FileBlockCard — without the host adapter', () => {
  it('shows a ready file with no button', async () => {
    await mount(READY_CSV)
    expect(text()).toContain('Available until Oct 27, 2026')
    expect(button()).toBeNull()
  })

  it('shows a preparing file as sent, and reads nothing', async () => {
    await mount(CSV)
    await advance(60_000)
    expect(text()).toContain('Preparing…')
    expect(button()).toBeNull()
  })
})

describe('FileBlockCard — the Download button', () => {
  it('calls the host with the block', async () => {
    const host = fakeHost()
    await mount(READY_CSV, host)
    await act(async () => button()?.click())
    expect(host.download).toHaveBeenCalledTimes(1)
    expect(host.download).toHaveBeenCalledWith(READY_CSV)
  })

  it('is busy while the host promise runs', async () => {
    const host = fakeHost()
    let finish: () => void = () => {}
    host.download.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    await mount(READY_CSV, host)

    await act(async () => button()?.click())
    expect(button()?.disabled).toBe(true)
    expect(button()?.getAttribute('aria-busy')).toBe('true')

    await act(async () => finish())
    expect(button()?.disabled).toBe(false)
    expect(button()?.getAttribute('aria-busy')).toBe('false')
  })

  it('shows a short error when the host rejects, and the card still works', async () => {
    const host = fakeHost()
    host.download.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await mount(READY_CSV, host)

    await act(async () => button()?.click())
    expect(text()).toContain('Download failed. Try again.')
    expect(button()?.disabled).toBe(false)

    await act(async () => button()?.click())
    expect(host.download).toHaveBeenCalledTimes(2)
    expect(text()).not.toContain('Download failed')
  })

  it('survives a host that throws before it returns a promise', async () => {
    const host = fakeHost()
    host.download.mockImplementationOnce(() => {
      throw new Error('no storage')
    })
    await mount(READY_CSV, host)
    await act(async () => button()?.click())
    expect(text()).toContain('Download failed. Try again.')
  })

  it('turns to "Expired" when the download answers 410', async () => {
    const host = fakeHost()
    host.download.mockRejectedValueOnce(httpError(410))
    await mount(READY_CSV, host)
    await act(async () => button()?.click())
    expect(text()).toContain('Expired')
    expect(text()).not.toContain('Download failed')
    expect(button()).toBeNull()
  })
})

describe('FileBlockCard — the status poll', () => {
  it('reads at mount, every 2 s for 30 s, then every 10 s', async () => {
    const host = fakeHost([statusOf({ status: 'preparing' })])
    await mount(CSV, host)
    expect(host.status).toHaveBeenCalledTimes(1)

    await advance(2_000)
    expect(host.status).toHaveBeenCalledTimes(2)
    await advance(28_000)
    expect(host.status).toHaveBeenCalledTimes(16)

    await advance(9_999)
    expect(host.status).toHaveBeenCalledTimes(16)
    await advance(1)
    expect(host.status).toHaveBeenCalledTimes(17)
    await advance(10_000)
    expect(host.status).toHaveBeenCalledTimes(18)
  })

  it('reads with the block and an abort signal', async () => {
    const host = fakeHost()
    await mount(CSV, host)
    const [block, signal] = host.status.mock.calls[0]
    expect(block).toBe(CSV)
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it.each<[string, FileStatus]>([
    ['ready', statusOf({ status: 'ready' })],
    ['failed', statusOf({ status: 'failed', error: 'The query took too long.' })],
    ['expired', statusOf({ status: 'expired' })],
  ])('stops once the file is %s', async (_state, final) => {
    const host = fakeHost([statusOf({ status: 'preparing' }), statusOf({ status: 'preparing' }), final])
    await mount(CSV, host)
    await advance(4_000)
    expect(host.status).toHaveBeenCalledTimes(3)
    await advance(120_000)
    expect(host.status).toHaveBeenCalledTimes(3)
  })

  it('turns a preparing card into a ready one with its final details', async () => {
    const host = fakeHost([statusOf({ status: 'preparing' }), statusOf({ status: 'ready' })])
    await mount(CSV, host)
    expect(button()).toBeNull()
    await advance(2_000)
    expect(text()).toContain('CSV · 471 KB · 12,840 rows')
    expect(button()).not.toBeNull()
  })

  it('reads a replayed block once when its job has ended', async () => {
    // History keeps the first state: a finished CSV still says `preparing`.
    const host = fakeHost([statusOf({ status: 'ready' })])
    await mount(CSV, host)
    await advance(120_000)
    expect(host.status).toHaveBeenCalledTimes(1)
    expect(button()).not.toBeNull()
  })

  it('never reads a block that was sent ready', async () => {
    const host = fakeHost()
    await mount(READY_CSV, host)
    await advance(60_000)
    expect(host.status).not.toHaveBeenCalled()
  })

  it('tries again after a failed read, on the same schedule', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const host = fakeHost([httpError(503), new TypeError('Failed to fetch'), statusOf()])
    await mount(CSV, host)
    await advance(4_000)
    expect(host.status).toHaveBeenCalledTimes(3)
    expect(button()).not.toBeNull()
    expect(console.warn).toHaveBeenCalledTimes(2)
  })

  it('tries again after a body it cannot read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const host = fakeHost([{ status: 'queued' } as unknown as FileStatus, statusOf()])
    await mount(CSV, host)
    await advance(2_000)
    expect(host.status).toHaveBeenCalledTimes(2)
    expect(button()).not.toBeNull()
  })

  it('stops on 404 and says the file is not available', async () => {
    const host = fakeHost([httpError(404)])
    await mount(CSV, host)
    await advance(60_000)
    expect(host.status).toHaveBeenCalledTimes(1)
    expect(text()).toContain('This file is not available.')
  })

  it('stops on 410 and shows "Expired"', async () => {
    const host = fakeHost([httpError(410)])
    await mount(CSV, host)
    await advance(60_000)
    expect(host.status).toHaveBeenCalledTimes(1)
    expect(text()).toContain('Expired')
  })

  it('does not read again when the host passes a new adapter object', async () => {
    const answers = [statusOf({ status: 'preparing' })]
    const host = fakeHost(answers)
    await mount(CSV, host)
    await mount(CSV, { ...host })
    await mount(CSV, { ...host })
    expect(host.status).toHaveBeenCalledTimes(1)
  })

  it('stops and aborts the read in flight on unmount', async () => {
    let seen: AbortSignal | undefined
    const host = fakeHost()
    host.status.mockImplementation((_block, signal) => {
      seen = signal
      return new Promise<FileStatus>(() => {})
    })
    await mount(CSV, host)
    expect(seen?.aborted).toBe(false)

    act(() => root.render(null))
    expect(seen?.aborted).toBe(true)
  })

  it('reads nothing after unmount', async () => {
    const host = fakeHost([statusOf({ status: 'preparing' })])
    await mount(CSV, host)
    await advance(2_000)
    expect(host.status).toHaveBeenCalledTimes(2)

    act(() => root.render(null))
    await advance(120_000)
    expect(host.status).toHaveBeenCalledTimes(2)
  })
})
