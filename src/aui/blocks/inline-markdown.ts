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

/**
 * Minimal, XSS-safe markdown for short captions.
 *
 * HTML entities are escaped first so no raw markup survives; only the
 * whitelisted inline patterns below produce tags. Links are forced to
 * rel="noopener noreferrer" and target="_blank".
 */
export function renderInlineMarkdown(text: string): string {
  if (!text) return ''

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Inline code
  html = html.replace(
    /`([^`\n]+)`/g,
    '<code class="cxc-aui-inline-code">$1</code>',
  )

  // Bold
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

  return html
}
