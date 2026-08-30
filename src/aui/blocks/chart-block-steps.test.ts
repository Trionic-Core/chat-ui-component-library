// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChartBlock as ChartBlockType, ChartType, DataRow } from '../aui-types'
import { ChartBlock } from './chart-block'

/* ------------------------------------------------------------------
 * The inline row steps, driven by actual clicks.
 *
 * The rest of the block's suite renders to static markup, where a button is
 * only a shape. A control the reader operates has to be operated to be tested:
 * this file mounts for real in jsdom and clicks the footer, so the assertion
 * covers the button, its label, the state and the height policy together.
 * ----------------------------------------------------------------*/

const { captured } = vi.hoisted(() => ({
  captured: [] as { type: string; props: Record<string, unknown> }[],
}))

vi.mock('recharts', async () => {
  const { createElement: h, Fragment } = await import('react')
  const PRIMITIVES = [
    'ResponsiveContainer',
    'BarChart',
    'LineChart',
    'Bar',
    'Line',
    'XAxis',
    'YAxis',
    'CartesianGrid',
    'Tooltip',
    'Legend',
    'LabelList',
    'ReferenceLine',
  ]
  const SVG_ROOTS = new Set(['BarChart', 'LineChart'])
  const recorder = (type: string) => (props: Record<string, unknown>) => {
    captured.push({ type, props })
    return h(SVG_ROOTS.has(type) ? 'svg' : Fragment, null, (props.children ?? null) as never)
  }
  return Object.fromEntries(PRIMITIVES.map((name) => [name, recorder(name)]))
})

const HUNDRED: DataRow[] = Array.from({ length: 100 }, (_, i) => ({
  variant: `Variant #${i + 1}`,
  margin: -(5000 - i * 40),
}))

function block(chartType: ChartType, data: DataRow[]): ChartBlockType {
  return {
    type: 'chart',
    chart_type: chartType,
    x: { key: 'variant', label: 'Product Variant' },
    series: [{ key: 'margin', label: 'Gross Margin' }],
    data,
  }
}

let container: HTMLDivElement
let root: Root

function mount(chart: ChartBlockType) {
  act(() => {
    root.render(createElement(ChartBlock, { block: chart }))
  })
}

/** The footer's step buttons, in the order the reader meets them. */
function stepButtons(): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')].filter((button) =>
    (button.getAttribute('aria-label') ?? '').startsWith('Show '),
  ) as HTMLButtonElement[]
}

function clickStep(label: string) {
  const button = stepButtons().find((candidate) => candidate.textContent === label)
  if (!button) throw new Error(`no step button "${label}" in: ${footerText()}`)
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** The chart host, which carries the diagnostics and the height. */
function host(): HTMLElement {
  const element = container.querySelector('[data-cxc-shown]')
  if (!element) throw new Error('no chart host rendered')
  return element as HTMLElement
}

/**
 * The footer as a READER sees it: its items are separate elements laid out with
 * a flex gap, so textContent alone would run them together.
 */
function footerText(): string {
  const footer = container.querySelector('[data-cxc-footer]')
  if (!footer) return ''
  return [...footer.children]
    .map((child) => (child.textContent ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

/** Rows handed to the INLINE chart (the dialog's chart is not mounted). */
function inlineRows(): number {
  const charts = captured.filter((entry) => entry.type === 'BarChart')
  return (charts[0]?.props.data as DataRow[] | undefined)?.length ?? -1
}

beforeEach(() => {
  captured.length = 0
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('inline row steps', () => {
  it('offers the larger steps and the whole result', () => {
    mount(block('bar_horizontal', HUNDRED))
    expect(stepButtons().map((button) => button.textContent)).toEqual(['20', '50', 'All'])
    expect(footerText()).toContain('Showing 12 of 100 · 20 · 50 · All')
  })

  it('names each step for a reader who cannot see the footer', () => {
    mount(block('bar_horizontal', HUNDRED))
    expect(stepButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Show 20 rows',
      'Show 50 rows',
      'Show all 100 rows',
    ])
  })

  it('grows the chart in place when a step is chosen', () => {
    mount(block('bar_horizontal', HUNDRED))
    expect(inlineRows()).toBe(12)

    captured.length = 0
    clickStep('50')

    expect(inlineRows()).toBe(50)
    expect(host().dataset.cxcShown).toBe('50')
    expect(host().dataset.cxcTotal).toBe('100')
    // 50 bands x 28px + 46px of chrome: the 382px cap is the DEFAULT step's,
    // and past it the height is the reader's choice.
    expect(host().style.height).toBe(`${50 * 28 + 46}px`)
    expect(footerText()).toContain('Showing 50 of 100 · 12 · 20 · All')
  })

  it('shows every row on "All"', () => {
    mount(block('bar_horizontal', HUNDRED))
    captured.length = 0
    clickStep('All')

    expect(inlineRows()).toBe(100)
    expect(host().dataset.cxcShown).toBe('100')
    expect(host().style.height).toBe(`${100 * 28 + 46}px`)
  })

  it('lets the reader put the rows away again', () => {
    mount(block('bar_horizontal', HUNDRED))
    clickStep('All')
    captured.length = 0
    clickStep('12')

    expect(inlineRows()).toBe(12)
    expect(host().style.height).toBe('382px')
  })

  it('offers only the whole result when there is nothing between', () => {
    mount(block('bar_horizontal', HUNDRED.slice(0, 15)))
    expect(stepButtons().map((button) => button.textContent)).toEqual(['All'])
    expect(footerText()).toContain('Showing 12 of 15 · All')
  })

  it('offers nothing when every row is already drawn', () => {
    mount(block('bar_horizontal', HUNDRED.slice(0, 12)))
    expect(stepButtons()).toHaveLength(0)
    expect(footerText()).not.toContain('Showing')
  })

  it('offers nothing on a chart whose height is not its row count', () => {
    // A line draws all 100 points inside a fixed box; there is no cut to undo.
    mount(block('line', HUNDRED))
    expect(stepButtons()).toHaveLength(0)
    expect(host().dataset.cxcShown).toBe('100')
  })

  it('keeps the expand control, which always shows every row', () => {
    mount(block('bar_horizontal', HUNDRED))
    const expand = container.querySelector('button[aria-label="Expand chart"]')
    expect(expand).not.toBeNull()
  })
})
