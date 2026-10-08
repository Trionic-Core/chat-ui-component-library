import { test, expect, type Page } from '@playwright/test'
import type { BrowserChatInstance, BrowserChatOptions } from '../../src/browser/types'

declare global {
  interface Window {
    CypherXChat: typeof import('../../src/browser/index')
    chat: BrowserChatInstance
    secondChat: BrowserChatInstance
    sdkEvents: unknown[]
    violations: string[]
    submittedFeedback: unknown[]
    transportAborted: boolean
  }
}
const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const list: string[] = []
  errors.set(page, list)
  page.on('pageerror', error => list.push(error.message))
  await page.goto('/fixture')
})
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]))

async function mount(page: Page, options: BrowserChatOptions = {}) {
  await page.evaluate(options => { window.chat = window.CypherXChat.mount('#chat', { endpoint: '/chat', ...options }) }, options)
  await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible()
}

test('classic script works without React globals; real POST SSE, cookies and refreshed CSRF headers', async ({ page, context }, info) => {
  const id = info.testId
  await context.addCookies([{ name: 'session', value: 'test-session', url: 'http://127.0.0.1:5203' }])
  await page.evaluate(id => {
    window.sdkEvents = []
    let calls = 0
    window.chat = window.CypherXChat.mount('#chat', { endpoint: '/chat', headers: () => ({ 'X-Test-ID': id, 'X-CSRF-Token': String(++calls) }), onEvent: event => window.sdkEvents.push(event) })
    window.chat.send('first')
  }, id)
  await expect.poll(() => page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
  await expect(page.getByRole('log')).toContainText('Java-compatible')
  await page.evaluate(() => window.chat.send('second', { regenerate: true }))
  await expect.poll(() => page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
  const stats = await (await page.request.get(`/stats?id=${encodeURIComponent(id)}`)).json()
  expect(stats.request).toMatchObject({ csrf: '2', cookie: 'session=test-session', body: { message: 'second', session_id: 'server-session', regenerate: true } })
  expect(await page.evaluate(() => 'React' in window)).toBe(false)
  expect(await page.evaluate(() => window.sdkEvents.length)).toBe(4)
})

for (const width of [320, 407, 768, 1440]) {
  test(`isolated layouts at ${width}px resist host CSS and preserve host styles`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addStyleTag({ content: 'html {font-size:8px} body {font:italic 28px serif;line-height:9} table,th,td {padding:0!important;border:0!important;background:magenta!important;white-space:nowrap!important} button {font-size:40px!important} * {box-sizing:content-box!important}' })
    await mount(page, { height: '700px' })
    await page.evaluate(() => window.chat.send('table'))
    await expect.poll(() => page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
    await expect(page.locator('.cxc-table-scroll')).toBeVisible()
    await expect(page.getByRole('article').last()).toHaveCSS('opacity', '1')
    const table = page.locator('.cxc-table-scroll')
    await expect(table.locator('th').first()).toHaveCSS('min-width', '192px')
    await expect.poll(() => table.locator('th').first().evaluate(el => parseFloat(getComputedStyle(el).paddingLeft) || 0)).toBeGreaterThan(0)
    await expect(page.locator('#host-table td')).toHaveCSS('background-color', 'rgb(255, 0, 255)')
    await expect(page.locator('#outside')).toHaveCSS('font-size', '40px')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await table.evaluate(el => { el.scrollLeft = el.scrollWidth })
    expect(await table.evaluate(el => el.querySelector('th:last-child')!.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1)).toBe(true)
    await page.evaluate(() => window.chat.update({ theme: 'dark' }))
    await expect(page.getByRole('region', { name: 'Chat', exact: true })).toHaveCSS('background-color', 'rgb(28, 28, 28)')
    await expect(page.getByRole('textbox').locator('../..')).toHaveCSS('background-color', 'rgb(36, 36, 36)')
    if (width === 407) await info.attach('sdk-mobile-dark', { body: await page.locator('[data-cypherx-chat]').screenshot(), contentType: 'image/png' })
  })
}

test('Stop closes a waiting network stream and permits the next message', async ({ page }, info) => {
  const id = info.testId
  await mount(page, { headers: { 'X-Test-ID': id } })
  await page.evaluate(() => window.chat.send('wait'))
  await expect(page.getByRole('log')).toContainText('Waiting for more')
  await page.getByRole('button', { name: 'Stop generating' }).click()
  await expect.poll(async () => (await (await page.request.get(`/stats?id=${encodeURIComponent(id)}`)).json()).active).toBe(0)
  expect(await page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
  expect(await page.evaluate(() => window.chat.getState().messages.some(m => m.isStreaming))).toBe(false)
  await page.evaluate(() => window.chat.send('again'))
  await expect(page.getByRole('log')).toContainText('Java-compatible')
})

test('destroy closes streams, removes owned DOM only, rejects stale APIs and permits remount', async ({ page }, info) => {
  const id = info.testId
  await page.locator('#chat').evaluate(el => { const span = document.createElement('span'); span.id = 'preserved'; span.textContent = 'Existing content'; el.append(span) })
  await mount(page, { headers: { 'X-Test-ID': id } })
  await page.evaluate(() => window.chat.send('wait'))
  await expect(page.getByRole('log')).toContainText('Waiting for more')
  await page.evaluate(() => { window.chat.destroy(); window.chat.destroy() })
  await expect.poll(async () => (await (await page.request.get(`/stats?id=${encodeURIComponent(id)}`)).json()).active).toBe(0)
  await expect(page.locator('[data-cypherx-chat]')).toHaveCount(0)
  await expect(page.locator('#preserved')).toHaveText('Existing content')
  expect(await page.evaluate(() => { try { window.chat.send('late') } catch (error) { return String(error) } })).toContain('destroyed')
  await mount(page)
})

test('clear while streaming and immediate resend cannot be overwritten by the old request', async ({ page }) => {
  await mount(page)
  await page.evaluate(() => window.chat.send('wait'))
  await expect(page.getByRole('log')).toContainText('Waiting for more')
  await page.evaluate(() => { window.chat.clear(); window.chat.send('new conversation') })
  await expect.poll(() => page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
  const state = await page.evaluate(() => window.chat.getState())
  expect(state.messages).toHaveLength(2)
  expect(state.messages[0].content).toBe('new conversation')
  expect(state.activeSessionId).toBe('server-session')
})

test('multiple instances have independent state and themes; snapshots cannot mutate state', async ({ page }) => {
  await mount(page)
  await page.evaluate(() => {
    window.secondChat = window.CypherXChat.mount('#second', { endpoint: '/chat', theme: 'dark' })
    window.chat.send('first only')
    const copy = window.chat.getState(); copy.messages[0].content = 'mutated'
  })
  await expect.poll(() => page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
  expect(await page.evaluate(() => window.secondChat.getState().messages.length)).toBe(0)
  expect(await page.evaluate(() => window.chat.getState().messages[0].content)).toBe('first only')
  await page.evaluate(() => window.chat.destroy())
  await expect(page.locator('#second').getByRole('textbox')).toBeVisible()
})

test('floating widget supports input clicks, keyboard, open/close, expand and small screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.evaluate(() => { window.chat = window.CypherXChat.mount('#chat', { endpoint: '/chat', mode: 'widget' }) })
  await page.getByRole('button', { name: 'Open chat' }).click()
  const dialog = page.getByRole('dialog', { name: 'Chat assistant' })
  await expect(dialog).toBeVisible()
  const bounds = (await dialog.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
  const input = page.getByRole('textbox', { name: 'Message input' })
  await input.click()
  await input.fill('hello')
  await expect(dialog).toBeVisible()
  await input.press('Enter')
  await expect(page.getByRole('log')).toContainText('Java-compatible')
  await page.getByRole('button', { name: 'Expand', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Collapse', exact: true })).toBeVisible()
  await page.evaluate(() => window.chat.close())
  await expect(dialog).toBeHidden()
  await page.evaluate(() => window.chat.open())
  await expect(dialog).toBeVisible()
  await page.getByRole('button', { name: 'Close chat' }).click()
  await expect(dialog).toBeHidden()
})

for (const [message, error] of [['unauthorized', 'HTTP 401'], ['login', 'text/event-stream'], ['truncated', 'before the answer completed']]) {
  test(`handles ${message} response without executing or exposing server HTML`, async ({ page }) => {
    await mount(page)
    await page.evaluate(message => window.chat.send(message), message)
    await expect.poll(() => page.evaluate(() => window.chat.getState().error)).toContain(error)
    expect(await page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
    await expect(page.locator('body')).not.toContainText('private error must not appear')
  })
}

test('validates configuration, duplicate mounts and programmatic message limits', async ({ page }) => {
  await mount(page, { maxInputLength: 5 })
  const results = await page.evaluate(() => [
    () => window.CypherXChat.mount('#chat', { endpoint: '/chat' }),
    () => window.CypherXChat.mount('#missing', { endpoint: '/chat' }),
    () => window.CypherXChat.mount('#second', { endpoint: 'javascript:alert(1)' }),
    () => window.chat.send(''), () => window.chat.send('too long'),
  ].map(fn => { try { fn(); return false } catch { return true } }))
  expect(results).toEqual([true, true, true, true, true])
  await page.getByRole('textbox').fill('too long')
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled()
  await page.getByRole('textbox').press('Enter')
  expect(await page.evaluate(() => window.chat.getState().messages.length)).toBe(0)
})

test('custom transports receive cancellation and cannot append late tokens after clear', async ({ page }) => {
  await page.evaluate(() => {
    window.transportAborted = false
    window.chat = window.CypherXChat.mount('#chat', {
      onSend: async function* (_message, _session, _metadata, signal) {
        yield { type: 'token', text: 'Custom response' }
        await new Promise<void>(resolve => signal.addEventListener('abort', () => { window.transportAborted = true; resolve() }, { once: true }))
        yield { type: 'token', text: 'Must not appear after clear' }
      },
    })
    window.chat.send('custom')
  })
  await expect(page.getByRole('log')).toContainText('Custom response')
  await page.evaluate(() => window.chat.clear())
  await expect.poll(() => page.evaluate(() => window.transportAborted)).toBe(true)
  expect(await page.evaluate(() => window.chat.getState().messages)).toEqual([])
  await expect(page.locator('[data-cypherx-chat]')).not.toContainText('Must not appear')
})

test('session selector uses shadow-local keyboard focus and loads the chosen session', async ({ page }) => {
  await page.setViewportSize({ width: 407, height: 800 })
  await page.evaluate(() => {
    const sessions = ['Invoices', 'Customers'].map((title, index) => ({ id: String(index), title, messageCount: 1, createdAt: new Date(), updatedAt: new Date() }))
    window.chat = window.CypherXChat.mount('#chat', { endpoint: '/chat', showSessions: true, sessionAdapter: {
      list: async () => sessions,
      get: async id => ({ session: sessions[Number(id)], messages: [{ id: 'restored', role: 'assistant', content: `Restored ${sessions[Number(id)].title}`, timestamp: new Date() }] }),
    } })
  })
  await page.getByRole('button', { name: /^Current session:/ }).click()
  const options = page.getByRole('option')
  await expect(options.filter({ hasText: 'Invoices' })).toBeVisible()
  await options.filter({ hasText: 'Invoices' }).focus()
  await options.filter({ hasText: 'Invoices' }).press('ArrowDown')
  await expect(options.filter({ hasText: 'Customers' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('log')).toContainText('Restored Customers')
  expect(await page.evaluate(() => window.chat.getState().activeSessionId)).toBe('1')
})

test('feedback form remains open on internal clicks and submits the backend message ID', async ({ page }) => {
  await page.evaluate(() => {
    window.submittedFeedback = []
    window.chat = window.CypherXChat.mount('#chat', { endpoint: '/chat', feedback: {
      submit: async (id, feedback) => { window.submittedFeedback.push({ id, feedback }) }, remove: async () => {},
    } })
    window.chat.send('feedback')
  })
  await expect.poll(() => page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
  await page.getByRole('article').last().hover()
  await page.getByRole('button', { name: 'Dislike', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Provide feedback' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Incorrect', exact: true }).click()
  await dialog.getByRole('textbox').fill('Please verify the amount')
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click()
  expect(await page.evaluate(() => window.submittedFeedback)).toEqual([{ id: 'server-message', feedback: { rating: 'down', reasonCategory: 'incorrect', reasonText: 'Please verify the amount' } }])
})

test('voice language menu is usable inside the shadow tree without requesting microphone access', async ({ page }) => {
  await page.evaluate(() => {
    window.chat = window.CypherXChat.mount('#chat', { endpoint: '/chat', voice: {
      synthesize: async () => new Blob(), transcribe: async () => ({ text: 'test', language: 'English', language_code: 'en' }),
    }, voiceStatus: { enabled: true, locales: [
      { locale: 'en-IN', locale_name: 'English (India)', language_code: 'en', default_voice: 'en-IN-NeerjaNeural' },
      { locale: 'gu-IN', locale_name: 'Gujarati (India)', language_code: 'gu', default_voice: 'gu-IN-DhwaniNeural' },
    ] } })
  })
  await page.getByRole('button', { name: /^Dictation language:/ }).click()
  const search = page.getByRole('combobox', { name: 'Search dictation languages' })
  await search.click()
  await search.fill('Gujarati')
  await page.getByRole('option', { name: /Gujarati/ }).click()
  await expect(page.getByRole('button', { name: /Dictation language: Gujarati/ })).toBeVisible()
})

test('rendered Markdown cannot create scripts, active HTML or javascript links', async ({ page }) => {
  await page.evaluate(() => {
    window.chat = window.CypherXChat.mount('#chat', { endpoint: '/chat', initialMessages: [{ id: 'unsafe', role: 'assistant', timestamp: new Date(),
      content: '<script>window.hacked=true</script>\n\n<img src=x onerror="window.hacked=true">\n\n[unsafe](javascript:alert(1))\n\n```html\n<script>alert(1)</script>\n```',
    }] })
  })
  expect(await page.evaluate(() => 'hacked' in window)).toBe(false)
  await expect(page.locator('.cxc-markdown script, .cxc-markdown img, .cxc-markdown [onerror], .cxc-markdown a[href^="javascript:"]')).toHaveCount(0)
  await expect(page.locator('.cxc-markdown')).toContainText('<img')
})

test('ES module build works without bare imports or external requests', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/widget.mjs'
    const sdk = await import(path)
    window.chat = sdk.mount('#chat', { endpoint: '/chat' })
  })
  await expect(page.getByRole('textbox')).toBeVisible()
  await page.evaluate(() => window.chat.send('module'))
  await expect(page.getByRole('log')).toContainText('Java-compatible')
})

test('strict CSP allows the nonce stylesheet without unsafe-eval or unsafe-inline', async ({ page }) => {
  await page.addInitScript(() => { window.violations = []; document.addEventListener('securitypolicyviolation', e => window.violations.push(e.violatedDirective)) })
  await page.goto('/csp')
  await mount(page, { nonce: 'sdk-test' })
  await page.evaluate(() => window.chat.send('csp'))
  await expect(page.locator('.cxc-table-scroll')).toBeVisible()
  await expect(page.locator('.cxc-table-scroll th').first()).toHaveCSS('min-width', '192px')
  expect(await page.evaluate(() => window.violations)).toEqual([])
})

test('offline ZIP example renders tables, charts and followups with no remote assets', async ({ page }, info) => {
  const external: string[] = []
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5203/')) external.push(request.url()) })
  await page.goto('/examples/index.html')
  await page.getByRole('textbox').fill('sales')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.locator('.cxc-table-scroll')).toBeVisible()
  await expect(page.locator('.recharts-surface')).toBeVisible()
  expect(await page.locator('.recharts-bar-rectangle').count()).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Show products', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Show products', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.chat.getState().messages.filter(m => m.role === 'user').length)).toBe(2)
  await expect.poll(() => page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
  await expect(page.getByRole('article').last()).toHaveCSS('opacity', '1')
  expect(external).toEqual([])
  await info.attach('sdk-demo', { body: await page.screenshot(), contentType: 'image/png' })
})

test('system theme changes update auto but not explicit themes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await mount(page, { theme: 'auto' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.getByRole('region', { name: 'Chat', exact: true })).toHaveCSS('background-color', 'rgb(28, 28, 28)')
  await page.evaluate(() => window.chat.update({ theme: 'light', title: 'Support' }))
  await expect(page.getByRole('region', { name: 'Chat', exact: true })).not.toHaveCSS('background-color', 'rgb(28, 28, 28)')
  await expect(page.getByText('Support', { exact: true })).toBeVisible()
})

test('streaming and chart growth follow the bottom until the reader deliberately scrolls up', async ({ page }) => {
  await page.goto('/examples/index.html')
  await page.getByRole('textbox').fill('sales')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect.poll(() => page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
  const log = page.getByRole('log')
  await expect.poll(() => log.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(5)
  await log.evaluate(el => el.scrollTo({ top: 0, behavior: 'instant' }))
  await expect.poll(() => log.evaluate(el => el.scrollTop)).toBe(0)
  await expect(page.getByRole('button', { name: 'Scroll to latest messages', exact: true })).toBeVisible()
  await page.evaluate(() => window.chat.send('another summary'))
  await expect.poll(() => page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
  expect(await log.evaluate(el => el.scrollTop)).toBe(0)
  await page.getByRole('button', { name: 'Scroll to latest messages (1 new)', exact: true }).click()
  await expect.poll(() => log.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(5)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})

test('empty and cleared conversations retain scroll observers and unread counts', async ({ page }) => {
  await page.goto('/examples/index.html')
  await page.evaluate(() => { window.chat.destroy(); window.chat = window.CypherXChat.mount('#chat', {
    height: '400px',
    onSend: async function* () {
      yield { type: 'token', text: 'A long response.\n\n'.repeat(50) }
      yield { type: 'done' }
    },
  }) })
  for (let conversation = 0; conversation < 2; conversation++) {
    await expect(page.getByRole('heading', { name: 'How can I help you?' })).toBeVisible()
    await page.evaluate(() => window.chat.send('first'))
    await expect.poll(() => page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
    await expect(page.getByRole('article').last()).toHaveCSS('opacity', '1')
    const log = page.getByRole('log')
    await expect.poll(() => log.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(5)
    await log.evaluate(el => el.scrollTo({ top: 0, behavior: 'instant' }))
    await expect(page.getByRole('button', { name: 'Scroll to latest messages', exact: true })).toBeVisible()
    await page.evaluate(() => window.chat.send('second'))
    await expect.poll(() => page.evaluate(() => window.chat.getState().isStreaming)).toBe(false)
    await expect(page.getByRole('button', { name: 'Scroll to latest messages (1 new)', exact: true })).toBeVisible()
    expect(await log.evaluate(el => el.scrollTop)).toBe(0)
    await page.evaluate(() => window.chat.clear())
  }
})

test('Markdown-only bundle renders readable tables without loading the widget or React', async ({ page }) => {
  await page.goto('/health')
  await page.setContent('<main class="cxc-markdown" style="width:280px"></main>')
  await page.addStyleTag({ url: '/markdown.css' })
  await page.addScriptTag({ url: '/markdown.min.js' })
  await page.evaluate(() => {
    const sdk = (window as unknown as { CypherXMarkdown: { renderMarkdown(text: string): string } }).CypherXMarkdown
    document.querySelector('main')!.innerHTML = sdk.renderMarkdown('| Item | Details |\n| --- | --- |\n| A | **Example** |')
  })
  await expect(page.locator('.cxc-table-scroll th').first()).toHaveCSS('min-width', '192px')
  await expect(page.locator('strong')).toHaveText('Example')
  expect(await page.locator('.cxc-table-scroll').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
  expect(await page.evaluate(() => 'CypherXChat' in window || 'React' in window)).toBe(false)
})
