import { describe, expect, it } from 'vitest'
import { isValidBlock, isValidViewSpec } from './aui-types'

/* ------------------------------------------------------------------
 * Runtime type-guard regression guard — the client's third reliability
 * layer (after agent constraint + server validation). A malformed block
 * must be rejected so the renderer can skip it rather than crash the
 * whole message.
 * ----------------------------------------------------------------*/

describe('isValidBlock — accepts each valid block type', () => {
  it('accepts a metric_group with a metrics array', () => {
    expect(isValidBlock({ type: 'metric_group', metrics: [] })).toBe(true)
  })

  it('accepts a well-formed chart', () => {
    expect(
      isValidBlock({
        type: 'chart',
        chart_type: 'bar',
        data: [],
        x: { key: 'month', label: 'Month' },
        series: [{ key: 'revenue', label: 'Revenue' }],
      }),
    ).toBe(true)
  })

  it('accepts a table with columns and rows', () => {
    expect(isValidBlock({ type: 'table', columns: [], rows: [] })).toBe(true)
  })

  it('accepts a text block with a markdown string', () => {
    expect(isValidBlock({ type: 'text', markdown: 'hello' })).toBe(true)
  })

  it('accepts an actions block with an actions array', () => {
    expect(isValidBlock({ type: 'actions', actions: [] })).toBe(true)
  })
})

describe('isValidBlock — rejects malformed input', () => {
  it('rejects an unknown block type', () => {
    expect(isValidBlock({ type: 'galaxy', data: [] })).toBe(false)
  })

  it('rejects a block missing its required fields', () => {
    expect(isValidBlock({ type: 'table', columns: [] })).toBe(false) // no rows
    expect(isValidBlock({ type: 'text' })).toBe(false) // no markdown
    expect(isValidBlock({ type: 'metric_group' })).toBe(false) // no metrics
  })

  it('rejects a chart whose field refs are malformed', () => {
    expect(
      isValidBlock({
        type: 'chart',
        chart_type: 'bar',
        data: [],
        x: { key: 'month' }, // missing label
        series: [],
      }),
    ).toBe(false)
  })

  it('rejects a chart whose markdown field has the wrong type', () => {
    expect(isValidBlock({ type: 'text', markdown: 123 })).toBe(false)
  })

  it('rejects non-objects, null, arrays, and primitives', () => {
    expect(isValidBlock(null)).toBe(false)
    expect(isValidBlock(undefined)).toBe(false)
    expect(isValidBlock('text')).toBe(false)
    expect(isValidBlock(42)).toBe(false)
    expect(isValidBlock([])).toBe(false)
    expect(isValidBlock([{ type: 'text', markdown: 'x' }])).toBe(false)
  })
})

describe('isValidViewSpec', () => {
  it('accepts a spec with a blocks array', () => {
    expect(isValidViewSpec({ surface_id: 's1', version: '1', blocks: [] })).toBe(true)
  })

  it('rejects a spec without a blocks array', () => {
    expect(isValidViewSpec({ surface_id: 's1' })).toBe(false)
    expect(isValidViewSpec(null)).toBe(false)
  })
})
