import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FILE_FORMAT_FALLBACKS } from './file-block'

/* ------------------------------------------------------------------
 * The file card's format colors are their own tokens, defined in both
 * themes. A chart slot cannot carry them: slot 4 is slate in light mode
 * and blue in dark mode, so a DOCX card changed hue with the theme.
 * ----------------------------------------------------------------*/

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(here, '../../styles/globals.css'), 'utf8')

function fileTokensIn(blockStart: string): Record<string, string> {
  const startIndex = css.indexOf(blockStart)
  if (startIndex === -1) throw new Error(`block not found in globals.css: ${blockStart}`)
  const bodyStart = css.indexOf('{', startIndex) + 1
  const bodyEnd = css.indexOf('\n  }', bodyStart)
  const body = css.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd)
  const tokens: Record<string, string> = {}
  for (const match of body.matchAll(/--cxc-file-(csv|pdf|docx)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    tokens[match[1]] = match[2].toUpperCase()
  }
  return tokens
}

/** HSL hue (degrees) and saturation (0..1) of a hex color. */
function hueSat(hex: string): { hue: number; sat: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const light = (max + min) / 2
  const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1))
  let hue = 0
  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6)
    else if (max === g) hue = 60 * ((b - r) / delta + 2)
    else hue = 60 * ((r - g) / delta + 4)
  }
  return { hue: (hue + 360) % 360, sat }
}

/** The dominant RGB channel of a hex color. */
function dominant(hex: string): 'r' | 'g' | 'b' {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  if (b > r && b > g) return 'b'
  return r >= g ? 'r' : 'g'
}

const light = fileTokensIn(':root {')
const dark = fileTokensIn('.dark,')

describe('file format colors', () => {
  it.each(['csv', 'pdf', 'docx'])('defines --cxc-file-%s in both themes', (format) => {
    expect(light[format]).toMatch(/^#[0-9A-F]{6}$/)
    expect(dark[format]).toMatch(/^#[0-9A-F]{6}$/)
  })

  it.each(['csv', 'pdf', 'docx'])('keeps the %s hue family in both themes', (format) => {
    expect(dominant(light[format])).toBe(dominant(dark[format]))
  })

  // A clear blue: the old slate slot (#264653, saturation 0.37) read as grey.
  it.each([
    ['light', () => light.docx],
    ['dark', () => dark.docx],
  ] as const)('DOCX is a clear blue in the %s theme', (_theme, docx) => {
    const { hue, sat } = hueSat(docx())
    expect(hue).toBeGreaterThanOrEqual(190)
    expect(hue).toBeLessThanOrEqual(240)
    expect(sat).toBeGreaterThanOrEqual(0.5)
  })

  it.each(['csv', 'pdf', 'docx'] as const)('the %s fallback is the light token', (format) => {
    expect(FILE_FORMAT_FALLBACKS[format].toUpperCase()).toBe(light[format])
  })
})
