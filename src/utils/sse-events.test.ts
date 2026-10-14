import { describe, expect, it } from 'vitest'
import { defaultParseEvent } from './sse-events'

describe('defaultParseEvent: action', () => {
  // The knowledge chat sends only a status line: {"status": "Searched documents"}.
  it('reads a status-only action as a running step labelled with that text', () => {
    expect(defaultParseEvent('action', '{"status": "Searched documents"}')).toMatchObject({
      type: 'action',
      action: { label: 'Searched documents', status: 'running' },
    })
  })

  it('keeps label and a known status as they are', () => {
    expect(defaultParseEvent('action', '{"label": "Query data", "status": "completed"}')).toMatchObject({
      action: { label: 'Query data', status: 'completed' },
    })
  })

  it('prefers the label when both a label and a free-text status arrive', () => {
    expect(defaultParseEvent('action', '{"label": "Search", "status": "Searched documents"}')).toMatchObject({
      action: { label: 'Search', status: 'running' },
    })
  })
})
