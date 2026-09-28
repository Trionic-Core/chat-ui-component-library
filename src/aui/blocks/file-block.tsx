import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  Download,
  File,
  FileSpreadsheet,
  FileText,
  FileType,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion'
import type { FileBlock } from '../aui-types'
import type { FileHandler, FileStatus } from '../file-handler'
import {
  fileMeta,
  fileView,
  formatExpiry,
  isFileStatus,
  keepsPolling,
  nextPollDelayMs,
  refusalOf,
  type FileRefusal,
  type FileView,
} from './file-block-state'

/* ------------------------------------------------------------------
 * File Block
 *
 * A download card for a file the export tool made. A CSV arrives
 * `preparing` and the card reads the host's status until the file is
 * ready, failed or expired; a report arrives `ready`. The card never
 * builds a URL: FileHandler makes both requests.
 *
 * Live and replayed blocks share one rule — read the status from mount
 * while the state is preparing. The library cannot tell a replayed block
 * from a live one (the history adapter and a host's own AuiView carry no
 * flag), and it does not need to: a replayed block's job ended long ago,
 * so its first read is final and the card reads once.
 * ----------------------------------------------------------------*/

const FORMAT_ICON: Record<FileBlock['format'], LucideIcon> = {
  csv: FileSpreadsheet,
  pdf: FileText,
  docx: FileType,
}

/** Every icon on the card: 16 px, stroke 1.2. */
const ICON = { size: 16, strokeWidth: 1.2, 'aria-hidden': true } as const

const DOWNLOAD_FAILED_TEXT = 'Download failed. Try again.'

interface FileBlockCardProps {
  block: FileBlock
  files?: FileHandler
}

export function FileBlockCard({ block, files }: FileBlockCardProps) {
  const { status, refusal, setRefusal } = useFileStatus(block, files)
  const [busy, setBusy] = useState(false)
  const [downloadFailed, setDownloadFailed] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  const view = fileView(block, status, refusal, Date.now())
  const name = block.title || block.file_name
  const expired = view.state === 'expired'

  const handleDownload = useCallback(async () => {
    if (!files) return
    setBusy(true)
    setDownloadFailed(false)
    try {
      await files.download(block)
    } catch (error) {
      const code = refusalOf(error)
      if (code === null) setDownloadFailed(true)
      else setRefusal(code)
    } finally {
      setBusy(false)
    }
  }, [files, block, setRefusal])

  // The details keep at least 15rem; below that (a phone, the chat widget) the
  // button wraps under them instead of squeezing the text.
  return (
    <Card padding="sm" className="flex flex-wrap items-start gap-3">
      <div className="flex min-w-0 grow basis-60 items-start gap-3">
        <FormatTile
          Icon={FORMAT_ICON[block.format] ?? File}
          pulsing={Boolean(files) && keepsPolling(view.state) && !reducedMotion}
          dimmed={expired}
        />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium"
            title={name}
            style={{ color: expired ? 'var(--cxc-text-muted)' : 'var(--cxc-text)' }}
          >
            {name}
          </p>
          <p className="text-xs" style={{ color: 'var(--cxc-text-secondary)' }}>
            {fileMeta(block.format, view)}
          </p>
          <div aria-live="polite" className="text-xs">
            <StatusLine view={view} />
            {downloadFailed && <p style={{ color: 'var(--cxc-error)' }}>{DOWNLOAD_FAILED_TEXT}</p>}
          </div>
        </div>
      </div>

      {files && view.state === 'ready' && (
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0 rounded-lg"
          onClick={handleDownload}
          disabled={busy}
          aria-busy={busy}
          aria-label={`Download ${block.file_name}`}
        >
          {busy ? <Spinner still={reducedMotion} /> : <Download {...ICON} />}
          Download
        </Button>
      )}
    </Card>
  )
}

/* ---------------------------- Status poll ------------------------ */

/**
 * Read the file's status while it is preparing: every 2 s for 30 s, then
 * every 10 s, until the state is final. Unmount aborts the read in flight
 * and clears the next one.
 */
function useFileStatus(block: FileBlock, files: FileHandler | undefined) {
  const [status, setStatus] = useState<FileStatus | null>(null)
  const [refusal, setRefusal] = useState<FileRefusal | null>(null)

  // The loop reads the latest block and adapter from here. A host often passes
  // a new adapter object on each render; restarting the loop on that identity
  // would turn every re-render into another status read.
  const latest = useRef({ block, files })
  useEffect(() => {
    latest.current = { block, files }
  })

  const hasFiles = Boolean(files)
  const { file_id: fileId, status: sentStatus, expires_at: sentExpiry } = block

  useEffect(() => {
    if (!hasFiles || !keepsPolling(fileView(latest.current.block, null, null, Date.now()).state)) {
      return
    }
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      const { block: current, files: handler } = latest.current
      if (!handler) return
      try {
        const next = await handler.status(current, controller.signal)
        if (controller.signal.aborted) return
        if (!isFileStatus(next)) throw new Error('the status body has no known status')
        setStatus(next)
        if (!keepsPolling(fileView(current, next, null, Date.now()).state)) return
      } catch (error) {
        if (controller.signal.aborted) return
        const code = refusalOf(error)
        if (code !== null) {
          setRefusal(code)
          return
        }
        console.warn('[aui] file status read failed; the card tries again:', error)
      }
      timer = setTimeout(poll, nextPollDelayMs(Date.now() - startedAt))
    }

    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [hasFiles, fileId, sentStatus, sentExpiry])

  return { status, refusal, setRefusal }
}

/* ------------------------------ Parts ---------------------------- */

function StatusLine({ view }: { view: FileView }) {
  switch (view.state) {
    case 'preparing':
      return <p style={{ color: 'var(--cxc-text-muted)' }}>Preparing…</p>
    case 'ready': {
      const until = formatExpiry(view.expiresAt)
      return until ? <p style={{ color: 'var(--cxc-text-muted)' }}>Available until {until}</p> : null
    }
    case 'failed':
      return <p style={{ color: 'var(--cxc-error)' }}>{view.error}</p>
    case 'expired':
      return <p style={{ color: 'var(--cxc-text-muted)' }}>Expired</p>
  }
}

/** The format icon on a quiet tile. It breathes while the file is prepared. */
function FormatTile({
  Icon,
  pulsing,
  dimmed,
}: {
  Icon: LucideIcon
  pulsing: boolean
  dimmed: boolean
}) {
  return (
    <motion.span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
      style={{
        backgroundColor: 'var(--cxc-bg-subtle)',
        color: dimmed ? 'var(--cxc-text-muted)' : 'var(--cxc-text-secondary)',
      }}
      animate={{ opacity: pulsing ? [1, 0.45, 1] : 1 }}
      transition={
        pulsing ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }
      }
    >
      <Icon {...ICON} />
    </motion.span>
  )
}

function Spinner({ still }: { still: boolean }) {
  return (
    <motion.span
      className="inline-flex"
      animate={still ? undefined : { rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <Loader2 {...ICON} />
    </motion.span>
  )
}
