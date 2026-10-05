import { createRoot } from 'react-dom/client'
import { ChatContainer, ChatMessage, ChatProvider, type ChatMessageData } from '@cypherx/chat-ui'
import '../src/styles/globals.css'

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

createRoot(document.getElementById('root')!).render(
  <main style={{ padding: 16, fontFamily: 'var(--cxc-font-sans)', color: 'var(--cxc-text)' }}>
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
    <section data-case="chat-container" style={{ width: '100%', maxWidth: 407, height: 620 }}>
      <ChatProvider onSend={noSend} autoFocus={false} initialMessages={[message('chat', billing)]}>
        <ChatContainer />
      </ChatProvider>
    </section>
  </main>,
)
