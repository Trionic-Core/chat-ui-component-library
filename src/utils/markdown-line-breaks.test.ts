import { describe, expect, it } from 'vitest'
import { normalizeLineBreaks, renderMarkdown } from './markdown'

/**
 * Chat answers arrive one sentence per line. On a phone the renderer used to
 * join those lines into one paragraph, show a literal backslash-n as text,
 * and keep trailing spaces that widened the line. These tests pin the
 * line-break contract for every form a transport can deliver.
 */
describe('normalizeLineBreaks', () => {
  it('turns CRLF and a lone CR into LF', () => {
    expect(normalizeLineBreaks('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('keeps a backslash followed by n as text: a Windows path is not a line break', () => {
    expect(normalizeLineBreaks('C:\\new\\notes.txt')).toBe('C:\\new\\notes.txt')
  })
})

describe('renderMarkdown line breaks', () => {
  it('renders a bare newline inside a paragraph as a line break', () => {
    expect(renderMarkdown('Total sales were 1,200.\nThe top branch is Surat.'))
      .toBe('<p>Total sales were 1,200.<br />The top branch is Surat.</p>')
  })

  it('still renders a blank line as a paragraph break', () => {
    expect(renderMarkdown('First.\n\nSecond.')).toBe('<p>First.</p>\n<p>Second.</p>')
  })

  it('drops the trailing spaces of a Markdown hard break instead of keeping them', () => {
    expect(renderMarkdown('Line one.   \nLine two.')).toBe('<p>Line one.<br />Line two.</p>')
  })

  it('renders a trailing-backslash hard break', () => {
    expect(renderMarkdown('Line one.\\\nLine two.')).toBe('<p>Line one.<br />Line two.</p>')
  })

  it('preserves literal backslashes in prose, inline code and table cells', () => {
    expect(renderMarkdown('C:\\new\\notes.txt')).toBe('<p>C:\\new\\notes.txt</p>')
    expect(renderMarkdown('Use `\\n` as the delimiter.')).toBe('<p>Use <code>\\n</code> as the delimiter.</p>')
    expect(renderMarkdown('| Path | Total |\n| --- | --- |\n| C:\\new\\notes | 42 |')).toContain('<td>C:\\new\\notes</td><td>42</td>')
  })

  it('renders CRLF content the same as LF content', () => {
    expect(renderMarkdown('a\r\nb\r\n\r\nc')).toBe(renderMarkdown('a\nb\n\nc'))
  })

  it('keeps the bytes of fenced code', () => {
    const html = renderMarkdown('```js\nconst s = "a\\nb"\n```')
    expect(html).toContain('const s = &quot;a\\nb&quot;')
    expect(html).not.toContain('<br />')
  })

  it('does not break list and table parsing', () => {
    expect(renderMarkdown('- one\n- two\nAfter')).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n<p>After</p>')
    expect(renderMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |')).toContain('<td>1</td><td>2</td>')
  })
})
