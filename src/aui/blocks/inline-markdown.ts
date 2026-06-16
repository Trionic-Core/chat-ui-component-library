/* ------------------------------------------------------------------
 * Inline markdown renderer for AUI text blocks.
 *
 * Defense-in-depth, XSS-safe markdown for short captions. The AUI
 * builder already strips identifiers/secrets server-side; this renderer
 * HTML-escapes first, then applies a minimal whitelisted markdown subset
 * (bold, italic, inline code, links). It keeps a small focused renderer
 * (rather than reusing the chat markdown util) so this security-critical
 * function is independently unit-testable and self-contained.
 *
 * Lives in its own pure-TS module (not text-block.tsx) so the component
 * file stays component-only for React Fast Refresh.
 * ----------------------------------------------------------------*/

// Code-span placeholder sentinel. After HTML-escaping there are no literal
// '<' / '>' / '&' chars left, so a token wrapped in escaped angle brackets is
// inert text that survives the bold/italic/link passes untouched — and cannot
// be forged from user input, because the source's own '<' would already be
// '&lt;'. We tokenize inline code into `&lt;CXC-CODE:N&gt;` placeholders, run
// emphasis on the surrounding text only, then re-expand the placeholders.
const PLACEHOLDER_PREFIX = '&lt;CXC-CODE:'
const PLACEHOLDER_SUFFIX = '&gt;'
const PLACEHOLDER_RE = /&lt;CXC-CODE:(\d+)&gt;/g

/**
 * Minimal, XSS-safe markdown for short captions.
 *
 * HTML entities are escaped first so no raw markup survives; only the
 * whitelisted inline patterns below produce tags. Links are forced to
 * rel="noopener noreferrer" and target="_blank".
 *
 * Inline code is tokenized into placeholders BEFORE the emphasis passes, so
 * `*` / `**` inside a backtick span (e.g. `SELECT * FROM t`) stays literal
 * rather than being turned into <em>/<strong>.
 */
export function renderInlineMarkdown(text: string): string {
  if (!text) return ''

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Inline code — tokenize to placeholders so the emphasis passes never see the
  // code body. The placeholder uses escaped angle brackets, which can't appear
  // in the post-escape text from user input. The already-escaped <code> HTML is
  // re-inserted at the very end.
  const codeSpans: string[] = []
  html = html.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const index = codeSpans.push(`<code class="cxc-aui-inline-code">${code}</code>`) - 1
    return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`
  })

  // Bold (runs on non-code text only — code is behind placeholders)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Links [text](url) — only http(s) targets are allowed through. The URL
  // capture excludes quotes, whitespace, and angle brackets so a crafted href
  // cannot break out of the attribute (e.g. `https://x" onmouseover="…`); the
  // captured URL is then attribute-escaped as defense-in-depth before
  // interpolation.
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s"'<>)]+)\)/g,
    (_match, label: string, url: string) => {
      const href = url.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="cxc-aui-link">${label}</a>`
    },
  )

  // Line breaks
  html = html.replace(/\n/g, '<br />')

  // Re-insert the inline-code HTML now that emphasis/links are done. A user
  // caption could contain the literal text `<CXC-CODE:N>` (which escapes to a
  // placeholder-shaped string), so only expand indices we actually produced;
  // any forged/out-of-range placeholder is left as inert escaped text.
  html = html.replace(PLACEHOLDER_RE, (match, index: string) => {
    const span = codeSpans[Number(index)]
    return span ?? match
  })

  return html
}
