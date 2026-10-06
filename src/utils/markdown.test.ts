import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChatMessage } from '../components/chat-message'
import { ChatProvider } from '../components/chat-provider'
import { renderMarkdown } from './markdown'

const TABLE = [
  '| What you need help with | Where to check | What to do |',
  '| --- | --- | --- |',
  '| Bill amount looks wrong | **Billing Summary** | Verify quantity, tax, discounts and the final payable amount. |',
  '| Extra charges | Billing Summary | [Help](https://example.com/help) |',
].join('\n')

describe('Markdown tables', () => {
  it('preserves the keyboard-accessible scroll region through sanitization', () => {
    const html = renderMarkdown(TABLE)
    expect(html).toContain(
      '<div class="cxc-table-scroll" role="region" aria-label="Table" tabindex="0"><table>',
    )
    expect(html.match(/<th>/g)).toHaveLength(3)
    expect(html.match(/<td>/g)).toHaveLength(6)
    expect(html).toContain('<strong>Billing Summary</strong>')
    expect(html).toContain('<a href="https://example.com/help" target="_blank" rel="noopener noreferrer">Help</a>')
  })

  it.each([1, 2, 6])('keeps all %i columns inside one scroll region', (columns) => {
    const headers = Array.from({ length: columns }, (_, index) => `Column ${index + 1}`)
    const html = renderMarkdown([
      `| ${headers.join(' | ')} |`,
      `| ${headers.map(() => '---').join(' | ')} |`,
      `| ${headers.map(() => 'Value').join(' | ')} |`,
    ].join('\n'))
    expect(html.match(/class="cxc-table-scroll"/g)).toHaveLength(1)
    expect(html.match(/<th>/g)).toHaveLength(columns)
    expect(html.match(/<td>/g)).toHaveLength(columns)
  })

  it('keeps the Markdown styling scope in the default React message renderer', () => {
    const html = renderToStaticMarkup(createElement(ChatProvider, {
      onSend: async function* () {},
      children: createElement(ChatMessage, {
        message: { id: 'table', role: 'assistant', content: TABLE, timestamp: new Date(0) },
      }),
    }))
    expect(html).toContain('class="cxc-markdown text-[15px] leading-[1.7]"')
    expect(html).toContain(renderMarkdown(TABLE))
  })

  it('does not interpret user-provided HTML or event handlers in table cells', () => {
    const html = renderMarkdown('| Value |\n| --- |\n| <img src=x onerror=alert(1)> |')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
    expect(html).not.toMatch(/<[a-z][^>]*\sonerror=/i)
  })

  it('does not add a scroll region to ordinary paragraphs or fenced code', () => {
    expect(renderMarkdown('Plain **text**')).not.toContain('cxc-table-scroll')
    expect(renderMarkdown('```\n| Value |\n| --- |\n```')).not.toContain('cxc-table-scroll')
  })
})
