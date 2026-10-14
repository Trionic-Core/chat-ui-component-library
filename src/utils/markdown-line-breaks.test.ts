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

  it('turns a literal two-character backslash-n into LF', () => {
    expect(normalizeLineBreaks('Total 1,200.\\nTop branch Surat.')).toBe('Total 1,200.\nTop branch Surat.')
  })

  it('leaves fenced code untouched', () => {
    const code = 'before\\n\n```js\nconst s = "a\\nb"\n```\nafter\\n'
    expect(normalizeLineBreaks(code)).toBe('before\n\n```js\nconst s = "a\\nb"\n```\nafter\n')
  })

  it('leaves an unterminated fence untouched to its end', () => {
    expect(normalizeLineBreaks('x\\n\n```\nraw\\n')).toBe('x\n\n```\nraw\\n')
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

  it('renders a literal backslash-n as a line break, not as text', () => {
    const html = renderMarkdown('Total 1,200.\\nTop branch Surat.')
    expect(html).toBe('<p>Total 1,200.<br />Top branch Surat.</p>')
    expect(html).not.toContain('\\n')
  })

  it('renders CRLF content the same as LF content', () => {
    expect(renderMarkdown('a\r\nb\r\n\r\nc')).toBe(renderMarkdown('a\nb\n\nc'))
  })

  it('keeps the bytes of fenced code, including a literal backslash-n', () => {
    const html = renderMarkdown('```js\nconst s = "a\\nb"\n```')
    expect(html).toContain('const s = &quot;a\\nb&quot;')
    expect(html).not.toContain('<br />')
  })

  it('does not break list and table parsing', () => {
    expect(renderMarkdown('- one\n- two\nAfter')).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n<p>After</p>')
    expect(renderMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |')).toContain('<td>1</td><td>2</td>')
  })
})
