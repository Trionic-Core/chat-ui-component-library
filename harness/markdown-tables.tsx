import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ChatContainer, ChatMessage, ChatProvider, renderMarkdown, type ChatMessageData } from '@cypherx/chat-ui'

const params = new URLSearchParams(window.location.search)
const stylesheet = params.get('styles') ?? 'full'
if (stylesheet === 'full') await import('@cypherx/chat-ui/styles.css')
if (stylesheet === 'markdown') await import('@cypherx/chat-ui/markdown.css')

if (params.has('host-reset')) {
  const reset = document.createElement('style')
  reset.textContent = 'table {width:auto;table-layout:fixed;border-collapse:separate} th,td {padding:0;border:0;text-align:center;vertical-align:middle;white-space:nowrap;box-sizing:content-box} pre {max-width:none}'
  document.head.appendChild(reset)
}

const billing = [
  '| What you need help with | Where to check in VasyERP POS | What to do / key note |',
  '| --- | --- | --- |',
  '| Bill amount looks wrong | **Billing Summary (Bottom Calculation Area)** | Verify **Quantity, MRP Total, Tax Amount, Add Charges, Discount, Round Off, Amount (final payable)** |',
  '| Add/adjust extra charges | **Billing Summary** | Add extra charges from the billing summary. |',
].join('\n')

const fixtures = [
  { id: 'billing-mobile', width: 294, content: billing },
  { id: 'billing-desktop', width: 720, content: billing },
  { id: 'single-column', width: 294, content: '| Status |\n| --- |\n| Ready |' },
  { id: 'two-columns', width: 294, content: '| Item | Total |\n| --- | --- |\n| Invoice | 100.00 |' },
  { id: 'six-columns', width: 294, content: '| A | B | C | D | E | F |\n| --- | --- | --- | --- | --- | --- |\n| 1 | 2 | 3 | 4 | 5 | 6 |' },
  { id: 'long-token', width: 294, content: `| Reference | Link |\n| --- | --- |\n| ${'x'.repeat(180)} | [Help](https://example.com/help) |` },
]

function message(id: string, content: string): ChatMessageData {
  return { id, content, role: 'assistant', timestamp: new Date(0) }
}

const noSend = async function* () {}

const clientTable = [
  '| What you might mean by "bill or plan" | Module | What you can do (available manual content) |',
  '| --- | --- | --- |',
  '| Create a **new customer sales bill (invoice)** | POS | Add items (barcode/manual), select customer, choose Walk-In/Delivery, assign salesman, finalize payment & print. |',
  '| Add items to the bill | POS | Scan barcode / search product name to add products. |',
].join('\n')

function StreamingFixture() {
  const [content, setContent] = useState('')
  useEffect(() => {
    const update = (event: Event) => setContent((event as CustomEvent<string>).detail)
    window.addEventListener('markdown-fixture-token', update)
    return () => window.removeEventListener('markdown-fixture-token', update)
  }, [])
  return <div className="cxc-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
}

createRoot(document.getElementById('root')!).render(
  <main data-ready={stylesheet} style={{ padding: 16, fontSize: 15, fontFamily: 'var(--cxc-font-sans, sans-serif)', color: 'var(--cxc-text, #27272a)' }}>
    <section data-case="raw-table" style={{ width: '100%', maxWidth: 294, marginBottom: 24 }}>
      <h2 style={{ fontSize: 16 }}>Custom renderer, no Markdown ancestor</h2>
      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(clientTable) }} />
    </section>
    {(['flex', 'grid'] as const).map(layout => (
      <section key={layout} data-case={`${layout}-bubble`} style={{ width: '100%', maxWidth: 407, display: layout, gridTemplateColumns: '32px minmax(0, 1fr)', gap: 12, marginBottom: 24 }}>
        <span style={{ width: 32, flexShrink: 0 }}>V</span>
        <div className="cxc-markdown" style={{ minWidth: 0, padding: 12, border: '1px solid #d4d4d8' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(clientTable) }} />
      </section>
    ))}
    <section data-case="prose" className="cxc-root" style={{ width: '100%', maxWidth: 294, marginBottom: 24 }}>
      <div className="cxc-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown([
        '# Heading with a long identifier',
        '',
        '**Important reference**',
        '',
        `[${'reference'.repeat(35)}](https://example.com/help)`,
        '',
        '- A list item with a long reference: ' + 'x'.repeat(180),
        '',
        '```sql',
        'SELECT ' + 'column_name, '.repeat(40) + 'final_column FROM invoices;',
        '```',
      ].join('\n')) }} />
    </section>
    <section data-case="streaming" style={{ width: '100%', maxWidth: 294, marginBottom: 24 }}><StreamingFixture /></section>
    <table data-outside-markdown style={{ marginBottom: 24 }}><tbody><tr><td>Host application table</td></tr></tbody></table>
    {fixtures.map((fixture) => (
      <section
        key={fixture.id}
        data-case={fixture.id}
        style={{ width: '100%', maxWidth: fixture.width, marginBottom: 24 }}
      >
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>{fixture.id}</h2>
        <ChatProvider onSend={noSend} autoFocus={false}>
          <ChatMessage message={message(fixture.id, fixture.content)} />
        </ChatProvider>
      </section>
    ))}
    {stylesheet === 'full' && <section data-case="chat-container" style={{ width: '100%', maxWidth: 407, height: 620 }}>
      <ChatProvider onSend={noSend} autoFocus={false} initialMessages={[message('chat', billing)]}>
        <ChatContainer />
      </ChatProvider>
    </section>}
  </main>,
)
