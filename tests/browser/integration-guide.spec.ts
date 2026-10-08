import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'

const archive = JSON.parse(readFileSync('artifacts/latest-browser.json', 'utf8'))
const files = unzipSync(readFileSync(archive.path))
const guide = new TextDecoder().decode(files[`${archive.prefix}/DEVELOPER_INTEGRATION_GUIDE.md`])
const initialization = guide.match(/```javascript\n([\s\S]*?)\n```/)?.[1]
if (!initialization) throw new Error('Packaged guide is missing its JavaScript initialization example')

for (const source of ['guide', 'jsp-example']) {
  test(`${source} initializes with CSP nonce and refreshed CSRF headers`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/csp')
    await page.evaluate(() => {
      window.violations = []
      document.addEventListener('securitypolicyviolation', event => window.violations.push(event.violatedDirective))
      document.getElementById('chat')!.dataset.endpoint = '/chat'
      for (const [name, content] of [['csrf-token', 'first-token'], ['csrf-header', 'X-CSRF-Token']]) {
        const meta = document.createElement('meta')
        meta.name = name
        meta.content = content
        document.head.append(meta)
      }
    })
    if (source === 'guide') {
      await page.route('**/app/chat-init.js', route => route.fulfill({ contentType: 'text/javascript', body: initialization }))
    }
    await page.evaluate(source => new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.nonce = 'sdk-test'
      script.src = source === 'guide' ? '/app/chat-init.js' : '/examples/jsp-init.js'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Initialization script failed to load'))
      document.body.append(script)
    }), source)
    for (const token of ['first-token', 'rotated-token']) {
      await page.locator('meta[name="csrf-token"]').evaluate((el, token) => { (el as HTMLMetaElement).content = token }, token)
      const sent = page.waitForRequest(request => request.url().endsWith('/chat') && request.method() === 'POST')
      await page.getByRole('textbox', { name: 'Message input' }).fill('Check integration')
      await page.getByRole('button', { name: 'Send message', exact: true }).click()
      expect((await sent).headers()['x-csrf-token']).toBe(token)
      await expect(page.getByRole('log')).toContainText('Java-compatible')
      await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0)
    }
    await expect(page.locator('.cxc-table-scroll th').first()).toHaveCSS('min-width', '192px')
    expect(await page.evaluate(() => window.violations)).toEqual([])
    expect(errors).toEqual([])
  })
}
