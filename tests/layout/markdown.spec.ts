import { expect, test, type Page } from '@playwright/test'

const browserErrors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
})
test.afterEach(({ page }) => { expect(browserErrors.get(page)).toEqual([]) })

async function openFixture(page: Page, query = '') {
  await page.goto(`/markdown-tables.html${query}`)
  await expect(page.locator('main[data-ready]')).toBeVisible()
}

async function assertTableLayout(page: Page) {
  const results = await page.locator('.cxc-table-scroll').evaluateAll(wrappers => wrappers.map(wrapper => {
    const el = wrapper as HTMLElement
    const cells = Array.from(el.querySelectorAll<HTMLElement>('th,td'))
    const minWidth = parseFloat(getComputedStyle(document.documentElement).fontSize) * 12
    el.scrollLeft = el.scrollWidth
    const lastColumn = el.querySelector('th:last-child')!.getBoundingClientRect()
    const result = {
      styled: getComputedStyle(el).getPropertyValue('--cxc-markdown-style-version').trim(),
      cellsReadable: cells.every(cell => cell.getBoundingClientRect().width >= minWidth - 1),
      cellsContained: cells.every(cell => cell.scrollWidth <= cell.clientWidth + 1),
      topAligned: cells.every(cell => getComputedStyle(cell).verticalAlign === 'top'),
      spaced: cells.every(cell => parseFloat(getComputedStyle(cell).paddingLeft) > 0),
      bordered: cells.every(cell => parseFloat(getComputedStyle(cell).borderTopWidth) > 0),
      reachable: lastColumn.right <= el.getBoundingClientRect().right + 1,
    }
    el.scrollLeft = 0
    return result
  }))
  expect(results.length).toBeGreaterThan(0)
  for (const result of results) {
    expect(result).toEqual({ styled: '2', cellsReadable: true, cellsContained: true, topAligned: true, spaced: true, bordered: true, reachable: true })
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
}

for (const styles of ['full', 'markdown']) {
  for (const width of [320, 407, 768, 1440]) {
    test(`${styles} CSS contains tables at ${width}px, including raw custom renderers`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await openFixture(page, `?styles=${styles}&host-reset`)
      await assertTableLayout(page)
      const raw = page.locator('[data-case="raw-table"] .cxc-table-scroll')
      expect(await raw.evaluate(el => el.closest('.cxc-markdown') === null)).toBe(true)
      expect(await raw.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
      if (width === 407) {
        await testInfo.attach('client-table', { body: await page.locator('[data-case="raw-table"]').screenshot(), contentType: 'image/png' })
      }
      expect(await page.locator('[data-case="single-column"] .cxc-table-scroll').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)

      await page.locator('html').evaluate(el => el.classList.add('dark'))
      await assertTableLayout(page)
      if (width === 407) {
        await testInfo.attach('client-table-dark', { body: await page.locator('[data-case="raw-table"]').screenshot(), contentType: 'image/png' })
      }
      await page.locator('main').evaluate(el => el.classList.add('cxc-compact'))
      await assertTableLayout(page)
      await page.locator('html').evaluate(el => { el.style.fontSize = '32px' })
      await assertTableLayout(page)
    })
  }

  test(`${styles} CSS wraps long prose and scrolls code rather than clipping it`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await openFixture(page, `?styles=${styles}&host-reset`)
    const prose = page.locator('[data-case="prose"] .cxc-markdown')
    await expect(prose.locator('h3')).toHaveCSS('font-weight', '600')
    await expect(prose.locator('strong')).toHaveCSS('font-weight', '600')
    expect(await prose.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    const code = prose.locator('pre')
    await expect(code).toHaveCSS('overflow-x', 'auto')
    expect(await code.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
    await assertTableLayout(page)
  })

  test(`${styles} CSS keeps every column keyboard-accessible`, async ({ page }) => {
    await openFixture(page, `?styles=${styles}`)
    const table = page.locator('[data-case="raw-table"] .cxc-table-scroll')
    await table.scrollIntoViewIfNeeded()
    await table.focus()
    await expect(table).toBeFocused()
    await expect(table).toBeInViewport()
    // WebKit starts native keyboard scrolling on an animation frame.
    await table.press('ArrowRight', { delay: 100 })
    await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
    await expect(table).toHaveCSS('outline-width', '2px')
  })
}

test('partial streaming content stays within its container', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await openFixture(page)
  const table = '| Meaning | Module | Action |\n| --- | --- | --- |\n| Invoice | POS | ' + 'x'.repeat(180) + ' |'
  for (const end of [8, 28, 50, 80, table.length]) {
    await page.evaluate(content => window.dispatchEvent(new CustomEvent('markdown-fixture-token', { detail: content })), table.slice(0, end))
    await expect(page.locator('[data-case="streaming"]')).toContainText(end < 10 ? '| Meaning'.slice(0, end) : 'Meaning')
    expect(await page.locator('[data-case="streaming"]').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  }
  await assertTableLayout(page)
})

test('standalone Markdown CSS does not restyle the host application table', async ({ page }) => {
  await openFixture(page, '?styles=markdown&host-reset')
  await expect(page.locator('[data-outside-markdown] td')).toHaveCSS('padding-left', '0px')
  await expect(page.locator('[data-outside-markdown] td')).toHaveCSS('border-top-width', '0px')
  await expect(page.locator('[data-outside-markdown] td')).toHaveCSS('text-align', 'center')
  await assertTableLayout(page)
})

test('missing CSS is distinguishable from a correctly styled integration', async ({ page }) => {
  await openFixture(page, '?styles=none')
  const table = page.locator('[data-case="raw-table"] .cxc-table-scroll')
  expect(await table.evaluate(el => getComputedStyle(el).getPropertyValue('--cxc-markdown-style-version').trim())).toBe('')
})

test('embedded chat auto-scroll does not move the host page', async ({ page }) => {
  await page.setViewportSize({ width: 407, height: 820 })
  await openFixture(page)
  await expect(page.locator('[data-case="chat-container"] [role="article"]')).toHaveCSS('opacity', '1')
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
