import type { FileBlock } from './aui-types'

/* ------------------------------------------------------------------
 * The host side of the file card.
 *
 * The library never knows a URL or a credential: the host reads the file
 * routes with its own headers (X-API-Key, X-Access-Context) and hands the
 * results back. Without a FileHandler the card is informational only — no
 * button, no polling.
 * ----------------------------------------------------------------*/

/** The body of `GET /v1/enterprise/chat/files/{file_id}/status`. */
export interface FileStatus {
  file_id: string
  status: 'preparing' | 'ready' | 'failed' | 'expired'
  file_name: string
  format: string
  content_type: string
  size_bytes: number | null
  row_count: number | null
  truncated: boolean
  expires_at: string
  error_type: string | null
  /** One user sentence for a failed file. */
  error: string | null
}

/**
 * The two host actions the file card needs. Pass it as `AuiView.files`, or as
 * `ChatConfig.files` when the library renders the messages.
 *
 * On an HTTP error, reject with an error that carries the code as `status`
 * (for example `Object.assign(new Error('Gone'), { status: 410 })`). The card
 * reads 410 as "Expired" and 404 as "not available"; any other rejection is a
 * failed attempt that the reader can retry.
 */
export interface FileHandler {
  /** Download the file (`GET .../files/{file_id}`) and hand it to the browser. */
  download: (block: FileBlock) => void | Promise<void>
  /**
   * Read the file's status (`GET .../files/{file_id}/status`). The card aborts
   * `signal` when it unmounts; pass it to `fetch`.
   */
  status: (block: FileBlock, signal: AbortSignal) => Promise<FileStatus>
}
