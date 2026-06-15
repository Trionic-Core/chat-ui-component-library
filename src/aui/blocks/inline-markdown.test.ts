import { describe, expect, it } from 'vitest'
import { renderInlineMarkdown } from './inline-markdown'

/* ------------------------------------------------------------------
 * Security regression guard for the AUI text-block markdown renderer.
 *
 * This is the client's last line of defense before HTML reaches
 * dangerouslySetInnerHTML, so the exploit vectors below must NEVER
 * produce an event handler, a raw tag, or a javascript: URL.
 * ----------------------------------------------------------------*/

describe('renderInlineMarkdown — XSS hardening', () => {
  it('does not emit an anchor or a live event handler when a link href tries to break out of the attribute', () => {
    // The URL capture excludes the quote, so the crafted href never matches the
    // link pattern: no anchor is produced. The 'onmouseover' substring may
    // survive, but only as inert escaped text — never inside a real tag.
    const out = renderInlineMarkdown('[click](https://x" onmouseover="alert(1))')
    expect(out).not.toContain('<a')
    // No live attribute: 'onmouseover=' is never carried on an actual tag (the
    // only '<' chars in the output are the escaped '&lt;' form).
    expect(out).not.toMatch(/<[a-z][^>]*onmouseover/i)
  })

  it('rejects a javascript: pseudo-URL (no anchor is produced)', () => {
    const out = renderInlineMarkdown('[x](javascript:alert(1))')
    expect(out).not.toContain('<a href="javascript:')
    expect(out).not.toContain('<a')
  })

  it('fully HTML-escapes a raw img/onerror payload (no raw tag survives)', () => {
    const out = renderInlineMarkdown('<img src=x onerror=alert(1)>')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
    // The escaped form is inert text — the attribute name may appear but only
    // inside escaped angle brackets, never as a live handler on a real tag.
    expect(out).not.toContain('<img src=x onerror')
  })

  it('escapes a closing-script breakout attempt', () => {
    const out = renderInlineMarkdown('</div><script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('</div>')
    expect(out).toContain('&lt;script&gt;')
  })
})

describe('renderInlineMarkdown — legitimate rendering', () => {
  it('renders a normal http(s) link as a safe anchor', () => {
    const out = renderInlineMarkdown('[Google](https://google.com)')
    expect(out).toContain(
      '<a href="https://google.com" target="_blank" rel="noopener noreferrer"',
    )
    expect(out).toContain('>Google</a>')
  })

  it('renders bold, italic, and inline code', () => {
    expect(renderInlineMarkdown('**bold**')).toContain('<strong')
    expect(renderInlineMarkdown('*italic*')).toContain('<em>')
    expect(renderInlineMarkdown('`code`')).toContain('<code')
  })

  it('returns an empty string for empty input', () => {
    expect(renderInlineMarkdown('')).toBe('')
  })
})
