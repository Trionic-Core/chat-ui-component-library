import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'

// Serve only the delivered ZIP, not the source tree or node_modules.
const archive = JSON.parse(readFileSync('artifacts/latest-browser.json', 'utf8'))
const files = unzipSync(readFileSync(archive.path))
const active = new Map()
const requests = new Map()
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname === '/health') return res.end('ready')
  if (url.pathname === '/stats') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ active: active.get(url.searchParams.get('id')) ?? 0, request: requests.get(url.searchParams.get('id')) }))
  }
  if (url.pathname === '/chat' && req.method === 'POST') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    const id = req.headers['x-test-id'] ?? 'default'
    requests.set(id, { body, csrf: req.headers['x-csrf-token'], cookie: req.headers.cookie })
    if (body.message === 'unauthorized') { res.writeHead(401); return res.end('private error must not appear') }
    if (body.message === 'login') { res.setHeader('Content-Type', 'text/html'); return res.end('<h1>Login</h1>') }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    res.flushHeaders()
    active.set(id, (active.get(id) ?? 0) + 1)
    let timer
    res.on('close', () => { active.set(id, active.get(id) - 1); clearInterval(timer) })
    const event = (name, data) => res.write(`event: ${name}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`)
    event('token', { text: body.message === 'wait' ? 'Waiting for more' : 'Hello from the Java-compatible SSE endpoint.\n\n| Item | Details |\n| --- | --- |\n| Invoice | ' + 'LongReference'.repeat(35) + ' |\n' })
    if (body.message === 'wait') { timer = setInterval(() => res.write(': heartbeat\n\n'), 100); return }
    if (body.message !== 'truncated') event('done', { session_id: 'server-session', message_id: 'server-message' })
    res.end()
    return
  }
  if (url.pathname === '/fixture' || url.pathname === '/csp') {
    if (url.pathname === '/csp') res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'nonce-sdk-test'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'")
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><button id="outside">Host button</button><table id="host-table"><tr><td>Host cell</td></tr></table><div id="chat"></div><div id="second"></div><script src="/widget.min.js"></script></body></html>')
  }
  const path = url.pathname === '/' ? '/examples/index.html' : url.pathname
  const bytes = files[archive.prefix + path]
  if (!bytes) { res.writeHead(404); return res.end('Not found') }
  const extension = path.split('.').pop()
  res.setHeader('Content-Type', ({ js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json' })[extension] ?? 'text/plain')
  res.end(Buffer.from(bytes))
})
server.listen(Number(process.env.PORT ?? 5203), '127.0.0.1', () => console.log(`Serving verified ${archive.path}`))
