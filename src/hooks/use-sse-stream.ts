import { useEffect, useRef } from 'react'
import type { ChatSendFn, SSEStreamConfig } from '../types'
import { createSSEClient } from '../utils/sse'

/** A stable send function backed by the shared, abortable browser transport. */
export function useSSEStream(config: SSEStreamConfig): ChatSendFn {
  const configRef = useRef(config)
  configRef.current = config
  const client = useRef<ReturnType<typeof createSSEClient> | null>(null)
  if (!client.current) client.current = createSSEClient(() => configRef.current)
  useEffect(() => () => client.current?.abort(), [])
  return client.current.send
}
