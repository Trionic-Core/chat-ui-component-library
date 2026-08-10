import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CHART_FALLBACKS, CHART_COLOR_COUNT, getChartColor } from './chart-colors'

/* ------------------------------------------------------------------
 * Chart palette drift guard.
 *
 * The palette lives in two places by necessity: as CSS custom properties in
 * globals.css (what actually paints, and what a client overrides) and as the
 * TS fallback emitted inside `var(--cxc-chart-N, <hex>)` (what paints when the
 * consumer never imported the stylesheet). Until now they matched only by
 * convention — a hex edited in one place and not the other produced two
 * different palettes depending on whether the stylesheet loaded.
 *
 * These tests read the real CSS and fail on any divergence. They also assert
 * the `.dark` block actually defines its own chart tokens: it previously
 * defined ZERO, so dark mode silently reused the light hexes and one slot
 * measured 1.69:1 against the dark surface.
 * ----------------------------------------------------------------*/

const here = dirname(fileURLToPath(import.meta.url))
const CSS_PATH = resolve(here, '../styles/globals.css')
const css = readFileSync(CSS_PATH, 'utf8')

/**
 * The `--cxc-chart-N` declarations inside one CSS block, keyed by slot number.
 *
 * `blockStart` is matched literally (a selector or the `:root {` opener); the
 * body is everything up to the first line that closes it at that indent, which
 * is enough for this flat token file and keeps the guard dependency-free.
 */
function chartTokensIn(blockStart: string): Record<number, string> {
  const startIndex = css.indexOf(blockStart)
  if (startIndex === -1) throw new Error(`block not found in globals.css: ${blockStart}`)
  const bodyStart = css.indexOf('{', startIndex) + 1
  const bodyEnd = css.indexOf('\n  }', bodyStart)
  const body = css.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd)

  const tokens: Record<number, string> = {}
  for (const match of body.matchAll(/--cxc-chart-(\d+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    tokens[Number(match[1])] = match[2].toUpperCase()
  }
  return tokens
}

const lightTokens = chartTokensIn(':root {')
const darkTokens = chartTokensIn('.dark,')

describe('chart palette — CSS tokens and TS fallbacks stay in sync', () => {
  it('defines exactly one CSS token per fallback slot', () => {
    expect(Object.keys(lightTokens)).toHaveLength(CHART_FALLBACKS.length)
  })

  it.each(CHART_FALLBACKS.map((hex, i) => [i + 1, hex] as const))(
    'slot %i CSS token matches the TS fallback (%s)',
    (slot, hex) => {
      expect(lightTokens[slot]).toBe(hex.toUpperCase())
    },
  )

  it('emits the matching fallback inside the var() reference', () => {
    CHART_FALLBACKS.forEach((hex, index) => {
      expect(getChartColor(index)).toBe(`var(--cxc-chart-${index + 1}, ${hex})`)
    })
  })

  it('wraps the palette for series beyond the last slot', () => {
    expect(getChartColor(CHART_COLOR_COUNT)).toBe(getChartColor(0))
    expect(getChartColor(-1)).toBe(getChartColor(CHART_COLOR_COUNT - 1))
  })
})

describe('chart palette — dark mode ships its own set', () => {
  it('defines a chart token for every slot under .dark', () => {
    for (let slot = 1; slot <= CHART_FALLBACKS.length; slot++) {
      expect(darkTokens[slot], `--cxc-chart-${slot} missing from the .dark block`).toMatch(
        /^#[0-9A-F]{6}$/,
      )
    }
  })

  it('lifts the slots that are illegible on the dark surface off the light value', () => {
    // Slot 4 measured 1.69:1 and slot 6 measured 2.99:1 on #1C1C1C with the
    // light hexes. Both must differ from :root or the dark set is decorative.
    expect(darkTokens[4]).not.toBe(lightTokens[4])
    expect(darkTokens[6]).not.toBe(lightTokens[6])
  })
})

/* ------------------------------------------------------------------
 * Measured accessibility floor.
 *
 * The numbers in the globals.css comment are the reason those hexes were
 * chosen; without a check they rot into decoration. WCAG 1.4.11 puts the bar
 * for a non-text graphical object at 3:1 against its surface.
 * ----------------------------------------------------------------*/

const LIGHT_SURFACE = '#FAFAF8'
const DARK_SURFACE = '#1C1C1C'
// Pale warm hues cannot reach 3:1 on a near-white surface without turning into
// dark ochre / burnt orange. They are held at the brand value by owner
// decision, so they are listed here rather than silently passing the check.
const LIGHT_EXEMPT_SLOTS = [3, 5]

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('chart palette — contrast against its own surface', () => {
  it.each(
    Object.entries(lightTokens).filter(([slot]) => !LIGHT_EXEMPT_SLOTS.includes(Number(slot))),
  )('light slot %s (%s) clears 3:1 on the light surface', (_slot, hex) => {
    expect(contrastRatio(hex, LIGHT_SURFACE)).toBeGreaterThanOrEqual(3)
  })

  it.each(Object.entries(darkTokens))(
    'dark slot %s (%s) clears 3:1 on the dark surface',
    (_slot, hex) => {
      expect(contrastRatio(hex, DARK_SURFACE)).toBeGreaterThanOrEqual(3)
    },
  )
})
