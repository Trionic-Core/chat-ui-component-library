import { test, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'

test('extracted ZIP runs directly from disk without a server or network requests', async ({ page }, info) => {
  const archive = JSON.parse(await readFile('artifacts/latest-browser.json', 'utf8'))
  const directory = info.outputPath('extracted')
  for (const [name, bytes] of Object.entries(unzipSync(await readFile(archive.path)))) {
    const path = resolve(directory, name)
    if (!path.startsWith(directory + sep)) throw new Error('Unexpected ZIP entry')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, bytes)
  }
  const errors: string[] = []
  const remote: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()) })
  await page.goto(pathToFileURL(resolve(directory, archive.prefix, 'examples/index.html')).href)
  await page.getByRole('textbox').fill('sales')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.locator('.cxc-table-scroll')).toBeVisible()
  await expect(page.locator('.recharts-surface')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show products', exact: true })).toBeVisible()
  expect(remote).toEqual([])
  expect(errors).toEqual([])
})
