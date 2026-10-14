import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'

const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []
  errors.set(page, list)
  page.on('pageerror', error => list.push(error.message))
})
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]))

async function openChart(page: Page, query = '') {
  await page.goto(`/responsive-charts.html?${query}`)
  await expect(page.locator('.recharts-surface').first()).toBeVisible()
  await expect(page.locator('.recharts-legend-wrapper')).toBeVisible()
  await expect(page.locator('.cxc-chart-legend-item').first()).toBeVisible()
}

async function assertTitleFits(page: Page) {
  const title = page.locator('h4')
  expect(await title.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
}

async function assertChartLayout(page: Page) {
  await expect.poll(() => page.locator('.cxc-chart-plot').evaluateAll(plots => plots.every(plot => {
    const svg = plot.querySelector('.recharts-wrapper > svg')
    return svg && Math.abs(svg.getBoundingClientRect().width - plot.getBoundingClientRect().width) <= 1
  }))).toBe(true)
  const results = await page.locator('[data-cxc-shown]').evaluateAll(hosts => hosts.map(host => {
    const plot = host.querySelector('.cxc-chart-plot')!.getBoundingClientRect()
    const legend = host.querySelector('.cxc-chart-legend')!.getBoundingClientRect()
    const labels = Array.from(host.querySelectorAll<HTMLElement>('.cxc-chart-legend-item'))
    return {
      readablePlot: plot.width >= 190 && plot.height >= 200,
      separateLegend: legend.top >= plot.bottom - 1,
      labelsContained: labels.every(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= legend.right + 1),
      contained: host.scrollWidth <= host.clientWidth + 1,
    }
  }))
  expect(results.length).toBeGreaterThan(0)
  for (const result of results) expect(result).toEqual({ readablePlot: true, separateLegend: true, labelsContained: true, contained: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}

test('a narrow embedded chat does not use desktop sidebar or message gutters', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openChart(page, 'width=360&sessions')
  await expect(page.getByRole('button', { name: 'Close session sidebar' })).toBeHidden()
  const width = await page.locator('[data-cxc-shown]').first().evaluate(el => el.getBoundingClientRect().width)
  expect(width).toBeGreaterThanOrEqual(280)
  await assertTitleFits(page)
  await assertChartLayout(page)
})

test('long legends and titles stay readable without squeezing the chart', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await openChart(page, 'width=280&standalone&long-labels')
  await assertTitleFits(page)
  const legend = page.locator('.recharts-legend-wrapper')
  expect(await legend.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  const gridHeight = await page.locator('.recharts-cartesian-grid').evaluate(el => el.getBoundingClientRect().height)
  expect(gridHeight).toBeGreaterThan(160)
  await assertChartLayout(page)
})

test('standalone AUI views retain their width as flex and grid children', async ({ page }) => {
  await openChart(page, 'width=280&standalone')
  for (const display of ['flex', 'grid']) {
    await page.locator('[data-host]').evaluate((el, display) => { el.style.display = display }, display)
    await assertChartLayout(page)
  }
})

for (const type of ['bar_grouped', 'bar_horizontal', 'line', 'area', 'scatter', 'pie', 'donut']) {
  test(`${type} preserves the plot and every long legend label at 220px`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await openChart(page, `width=220&standalone&long-labels&type=${type}`)
    await assertTitleFits(page)
    await expect(page.locator('.cxc-chart-legend-item')).toHaveCount(['pie', 'donut'].includes(type) ? 8 : 6)
    await assertChartLayout(page)
    await info.attach(`${type}-narrow`, { body: await page.locator('[data-host]').screenshot(), contentType: 'image/png' })
  })
}

for (const width of [320, 390, 768, 1440]) {
  test(`daily sales chart is readable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await openChart(page, `width=${width}`)
    await assertChartLayout(page)
    await assertTitleFits(page)
    await expect(page.locator('.recharts-bar-rectangle path')).toHaveCount(4)
    await expect(page.locator('.cxc-chart-legend-label')).toHaveText(['Bills', 'Sales amount'])
    await info.attach(`daily-sales-${width}`, { body: await page.locator('[data-host]').screenshot(), contentType: 'image/png' })
  })
}

test('resizing only the embed switches layout and recovers after being hidden', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openChart(page, 'width=1000&sessions')
  await expect(page.getByRole('button', { name: 'Close session sidebar' })).toBeVisible()
  const host = page.locator('[data-host]')
  for (const width of [320, 800, 390]) {
    await host.evaluate((el, width) => { el.style.width = `${width}px` }, width)
    await assertChartLayout(page)
    await expect(page.getByRole('button', { name: 'Close session sidebar' })).toBeVisible({ visible: width >= 768 })
  }
  await host.evaluate(el => { el.style.display = 'none' })
  await expect(page.locator('.cxc-chart-plot')).toBeHidden()
  await host.evaluate(el => { el.style.width = '320px'; el.style.display = '' })
  await assertChartLayout(page)
})

test('large host fonts and dark mode do not clip titles or legends', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await openChart(page, 'width=360&long-labels')
  await page.locator('html').evaluate(el => { el.style.fontSize = '20px'; el.classList.add('dark') })
  await assertTitleFits(page)
  await assertChartLayout(page)
})

test('expanded chart, dismissal, and CSV export still work on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await openChart(page, 'width=304&long-labels')
  await page.getByRole('button', { name: 'Expand chart' }).focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await assertChartLayout(page)
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Expand chart' })).toBeFocused()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.csv$/)
})

test('disabling the legend leaves no reserved legend height', async ({ page }) => {
  await page.goto('/responsive-charts.html?width=320&standalone&no-legend')
  await expect(page.locator('.recharts-surface').first()).toBeVisible()
  await expect(page.locator('.recharts-legend-wrapper')).toHaveCount(0)
  await expect(page.locator('.cxc-chart-legend')).toHaveCSS('height', '0px')
  await assertChartLayout(page)
})

test('long tooltip labels wrap inside the chart rather than widening the page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await openChart(page, 'width=280&standalone&long-labels')
  await page.locator('.recharts-wrapper > svg').hover({ position: { x: 150, y: 80 } })
  const tooltip = page.locator('.recharts-tooltip-wrapper')
  await expect(tooltip).toBeVisible()
  await expect.poll(() => tooltip.evaluate(el => {
    const box = el.getBoundingClientRect()
    const chart = el.closest('.recharts-wrapper')!.getBoundingClientRect()
    return box.left >= chart.left - 1 && box.right <= chart.right + 1 && el.scrollWidth <= el.clientWidth + 1
  })).toBe(true)
  await expect(tooltip.locator('.recharts-tooltip-item')).toHaveCount(6)
  await assertChartLayout(page)
})

test('the rebuilt JSP widget keeps the same responsive chart layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.setContent('<div id="chat" style="width:320px"></div>')
  await page.addStyleTag({ content: 'ul,li{white-space:nowrap!important;font-size:40px!important} h4{white-space:nowrap!important} svg{max-width:20px!important}' })
  await page.addScriptTag({ path: resolve('dist/browser/widget.min.js') })
  await page.evaluate(() => {
    window.chat = window.CypherXChat.mount('#chat', {
      height: '740px', onSend: async function* () {}, autoFocus: false,
      initialMessages: [{ id: 'chart', role: 'assistant', content: '', timestamp: new Date(0), blocks: [{
        surface_id: 'sales', version: '1', blocks: [{
          type: 'chart', chart_type: 'bar_grouped', title: 'Daily sales breakdown',
          x: { key: 'day', label: 'Date' },
          series: [{ key: 'bills', label: 'Bills' }, { key: 'amount', label: 'Sales amount' }],
          data: [{ day: '2026-10-06', bills: 1, amount: 32 }, { day: '2026-10-07', bills: 6, amount: 1989 }],
        }],
      }] }],
    })
  })
  await expect(page.locator('.cxc-chart-legend-item')).toHaveCount(2)
  await assertTitleFits(page)
  await assertChartLayout(page)
  await page.evaluate(() => window.chat.destroy())
})
