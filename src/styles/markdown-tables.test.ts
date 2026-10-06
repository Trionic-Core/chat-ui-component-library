import { readFileSync } from 'node:fs'
import { parse } from 'postcss'
import { describe, expect, it } from 'vitest'

const css = parse(readFileSync(new URL('./globals.css', import.meta.url), 'utf8'))

function declarations(selector: string, stylesheet = css): Record<string, string> {
  const values: Record<string, string> = {}
  stylesheet.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return
    rule.walkDecls((declaration) => {
      values[declaration.prop] = declaration.value
    })
  })
  return values
}

describe('Markdown table layout policy', () => {
  it('contains horizontal scrolling within the table wrapper', () => {
    expect(declarations('.cxc-table-scroll')).toMatchObject({
      'min-width': '0',
      'max-width': '100%',
      'overflow-x': 'auto',
    })
  })

  it.each(['th', 'td'])('keeps %s cells readable without centering tall rows', (tag) => {
    expect(declarations(`.cxc-markdown ${tag}`)).toMatchObject({
      'min-width': '12rem',
      'vertical-align': 'top',
      'overflow-wrap': 'anywhere',
      padding: '0.6em 0.85em',
      border: '1px solid var(--cxc-border)',
    })
  })

  it('sizes by column rather than forcing every table to a fixed minimum width', () => {
    const table = declarations('.cxc-markdown table')
    expect(table.width).toBe('100%')
    expect(table['min-width']).toBeUndefined()
    expect(table['table-layout']).not.toBe('fixed')
  })

  it('shows keyboard focus inside the scroll container without clipping the outline', () => {
    expect(declarations('.cxc-table-scroll:focus-visible')).toMatchObject({
      outline: '2px solid var(--cxc-border-focus)',
      'outline-offset': '-2px',
    })
  })

  it('ships the same table rules in the distributable stylesheet', () => {
    const shipped = parse(readFileSync(new URL('../../dist/styles.css', import.meta.url), 'utf8'))
    for (const selector of [
      '.cxc-table-scroll', '.cxc-table-scroll:focus-visible',
      '.cxc-markdown table', '.cxc-markdown th', '.cxc-markdown td',
    ]) {
      expect(declarations(selector, shipped)).toEqual(declarations(selector))
    }
  })
})
