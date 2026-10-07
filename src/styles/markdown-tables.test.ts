import { readFileSync } from 'node:fs'
import { parse } from 'postcss'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./markdown.css', import.meta.url), 'utf8')
const css = parse(source)

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
      border: '1px solid var(--cxc-border, #d4d4d8)',
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
      outline: '2px solid var(--cxc-border-focus, #71717a)',
      'outline-offset': '-2px',
    })
  })

  it.each(['styles.css', 'markdown.css'])('ships the same table rules in %s', (file) => {
    const shipped = parse(readFileSync(new URL(`../../dist/${file}`, import.meta.url), 'utf8'))
    for (const selector of [
      '.cxc-table-scroll', '.cxc-table-scroll:focus-visible',
      '.cxc-markdown table', '.cxc-markdown th', '.cxc-markdown td',
      '.cxc-table-scroll > table', '.cxc-table-scroll th', '.cxc-table-scroll td',
    ]) {
      expect(declarations(selector, shipped)).toEqual(declarations(selector))
    }
  })

  it('styles generated table cells without a cxc-markdown ancestor', () => {
    for (const tag of ['th', 'td']) {
      expect(declarations(`.cxc-table-scroll ${tag}`)).toEqual(declarations(`.cxc-markdown ${tag}`))
    }
  })

  it('does not ship Tailwind layers, global resets, or theme prerequisites in markdown.css', () => {
    const atRules: string[] = []
    css.walkAtRules(rule => { atRules.push(rule.name) })
    expect(atRules).toEqual([])
    css.walkRules(rule => {
      expect(rule.selectors.every(selector => selector.includes('.cxc-'))).toBe(true)
    })
    expect(readFileSync(new URL('../../dist/markdown.css', import.meta.url), 'utf8')).toBe(source)
  })

  it('wraps ordinary text but scrolls code rather than silently hiding it', () => {
    expect(declarations('.cxc-markdown')['overflow-wrap']).toBe('anywhere')
    expect(declarations('.cxc-markdown')['overflow-x']).not.toBe('hidden')
    expect(declarations('.cxc-markdown pre')).toMatchObject({
      'max-width': '100%', 'overflow-x': 'auto', 'white-space': 'pre',
    })
  })
})
