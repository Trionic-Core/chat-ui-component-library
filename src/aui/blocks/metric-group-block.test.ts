import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MetricGroupBlock } from './metric-group-block'

describe('MetricGroupBlock sparkline', () => {
  it('provides positive first-frame dimensions without an invalid-size warning', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const html = renderToStaticMarkup(
        createElement(MetricGroupBlock, {
          block: {
            type: 'metric_group',
            metrics: [{ id: 'revenue', label: 'Revenue', value: 42, spark: [1, 2, 3] }],
          },
        }),
      )

      expect(html).toContain('width="80"')
      expect(html).toContain('height="28"')
      expect(warning.mock.calls.flat().join(' ')).not.toMatch(/(?:width|height)\(-1\)/)
    } finally {
      warning.mockRestore()
    }
  })
})
