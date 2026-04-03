import { useCallback, useEffect, useState } from 'react'
import type { ChatSession, SessionAdapter } from '../types'

interface UseSessionManagerReturn {
  sessions: ChatSession[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
}

/**
 * Wraps SessionAdapter with loading states and error handling.
 * If adapter is undefined, all operations are no-ops and sessions is empty.
 */
export function useSessionManager(adapter?: SessionAdapter): UseSessionManagerReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!adapter) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await adapter.list()
      setSessions(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sessions'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [adapter])

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!adapter?.delete) return
    try {
      await adapter.delete(sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete session'
      setError(message)
    }
  }, [adapter])

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    if (!adapter?.rename) return
    try {
      await adapter.rename(sessionId, title)
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rename session'
      setError(message)
    }
  }, [adapter])

  // Load sessions on mount
  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    sessions,
    isLoading,
    error,
    refresh,
    deleteSession,
    renameSession,
  }
}
