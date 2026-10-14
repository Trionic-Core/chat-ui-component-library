import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* ------------------------------------------------------------------
 * An AuiView host can render blocks without the library's styles.css (the
 * FDE console does). So no AUI layout may depend on a rule that ships only
 * in that file: AUI layout lives in Tailwind classes in the components.
 * ----------------------------------------------------------------*/

const here = dirname(fileURLToPath(import.meta.url))
const responsiveCss = readFileSync(resolve(here, '../styles/responsive.css'), 'utf8')

describe('AUI layout without styles.css', () => {
  it('responsive.css styles no AuiView or chart class', () => {
    expect(responsiveCss).not.toMatch(/\.cxc-(aui|chart)-/)
  })
})
