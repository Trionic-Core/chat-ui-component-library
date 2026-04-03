/**
 * Lightweight markdown renderer.
 *
 * Converts markdown text to sanitized HTML string for use with dangerouslySetInnerHTML.
 * Supports all common markdown features needed for chat messages.
 *
 * Security: All output is sanitized via an allowlist of safe HTML tags and attributes.
 * Script tags, event handlers, and javascript: URLs are stripped.
 */

// ============================================================================
// Sanitization
// ============================================================================

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'del', 'a', 'code', 'pre',
  'ul', 'ol', 'li', 'blockquote', 'table', 'thead', 'tbody',
  'tr', 'th', 'td', 'h3', 'h4', 'h5', 'h6', 'hr', 'div', 'span',
])

const ALLOWED_ATTR_MAP: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel', 'class']),
  pre: new Set(['class', 'data-language']),
  code: new Set(['class', 'data-language']),
  div: new Set(['class']),
  span: new Set(['class']),
  td: new Set(['class']),
  th: new Set(['class']),
}

/**
 * Strips disallowed HTML tags and attributes from an HTML string.
 * Uses regex-based allowlist filtering (no DOM parsing needed).
 */
function sanitize(html: string): string {
  // Remove script tags and their content entirely
  let result = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

  // Remove all on* event handlers from any tag
  result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')

  // Remove javascript: URLs
  result = result.replace(/href\s*=\s*["']?\s*javascript\s*:/gi, 'href="')

  // Process each HTML tag
  result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)?\/?>/g, (match, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase()
    const isClosing = match.startsWith('</')

    if (!ALLOWED_TAGS.has(tag)) {
      return ''
    }

    if (isClosing) {
      return `</${tag}>`
    }

    // Filter attributes
    const allowedAttrs = ALLOWED_ATTR_MAP[tag]
    if (!attrs || !allowedAttrs) {
      const selfClosing = match.endsWith('/>')
      return selfClosing ? `<${tag} />` : `<${tag}>`
    }

    const filteredAttrs: string[] = []
    const attrRegex = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g
    let attrMatch: RegExpExecArray | null

    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase()
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''

      if (!allowedAttrs.has(attrName)) continue

      // Validate href values
      if (attrName === 'href') {
        const trimmed = attrValue.trim().toLowerCase()
        if (
          !trimmed.startsWith('http://') &&
          !trimmed.startsWith('https://') &&
          !trimmed.startsWith('mailto:') &&
          !trimmed.startsWith('#')
        ) {
          continue
        }
      }

      filteredAttrs.push(`${attrName}="${attrValue}"`)
    }

    const attrStr = filteredAttrs.length > 0 ? ' ' + filteredAttrs.join(' ') : ''
    const selfClosing = match.endsWith('/>')
    return selfClosing ? `<${tag}${attrStr} />` : `<${tag}${attrStr}>`
  })

  return result
}

// ============================================================================
// Markdown Parsing
// ============================================================================

/**
 * Escapes HTML special characters in a string to prevent XSS
 * when inserting user content into HTML.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Processes inline markdown formatting (bold, italic, code, links, strikethrough).
 */
function processInline(text: string): string {
  let result = escapeHtml(text)

  // Inline code (must come first to prevent processing inside code)
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Bold + italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>')

  // Links [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  )

  // Line breaks (two or more spaces at end of line, or backslash)
  result = result.replace(/ {2,}\n/g, '<br />')

  return result
}

/**
 * Renders markdown text to a sanitized HTML string.
 *
 * Supports: bold, italic, strikethrough, inline code, code blocks,
 * links, headers, unordered/ordered lists, blockquotes, tables,
 * horizontal rules, and line breaks.
 *
 * Headings are capped: h1 -> h3, h2 -> h4, etc. to prevent layout disruption.
 */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.split('\n')
  const output: string[] = []
  let i = 0
  let inList: 'ul' | 'ol' | null = null

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code blocks
    if (line.trimStart().startsWith('```')) {
      const language = line.trimStart().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // Skip closing ```

      // Close any open list
      if (inList) {
        output.push(inList === 'ul' ? '</ul>' : '</ol>')
        inList = null
      }

      const code = escapeHtml(codeLines.join('\n'))
      const langAttr = language ? ` data-language="${escapeHtml(language)}"` : ''
      output.push(`<pre${langAttr}><code${langAttr}>${code}</code></pre>`)
      continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      if (inList) {
        output.push(inList === 'ul' ? '</ul>' : '</ol>')
        inList = null
      }
      output.push('<hr />')
      i++
      continue
    }

    // Headers (capped: h1->h3, h2->h4, h3->h5, etc.)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      if (inList) {
        output.push(inList === 'ul' ? '</ul>' : '</ol>')
        inList = null
      }
      const level = Math.min(headerMatch[1].length + 2, 6)
      output.push(`<h${level}>${processInline(headerMatch[2])}</h${level}>`)
      i++
      continue
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      if (inList) {
        output.push(inList === 'ul' ? '</ul>' : '</ol>')
        inList = null
      }
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      output.push(`<blockquote>${processInline(quoteLines.join('\n'))}</blockquote>`)
      continue
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-| :]*$/.test(lines[i + 1])) {
      if (inList) {
        output.push(inList === 'ul' ? '</ul>' : '</ol>')
        inList = null
      }

      // Parse header row
      const headerCells = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
      i += 2 // Skip header and separator rows

      const tableRows: string[][] = []
      while (i < lines.length && lines[i].includes('|')) {
        const cells = lines[i]
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean)
        tableRows.push(cells)
        i++
      }

      let tableHtml = '<div class="cxc-table-scroll"><table><thead><tr>'
      for (const cell of headerCells) {
        tableHtml += `<th>${processInline(cell)}</th>`
      }
      tableHtml += '</tr></thead><tbody>'
      for (const row of tableRows) {
        tableHtml += '<tr>'
        for (let c = 0; c < headerCells.length; c++) {
          tableHtml += `<td>${processInline(row[c] ?? '')}</td>`
        }
        tableHtml += '</tr>'
      }
      tableHtml += '</tbody></table></div>'
      output.push(tableHtml)
      continue
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/)
    if (ulMatch) {
      if (inList !== 'ul') {
        if (inList) output.push('</ol>')
        output.push('<ul>')
        inList = 'ul'
      }
      output.push(`<li>${processInline(ulMatch[2])}</li>`)
      i++
      continue
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+[.)]\s+(.+)$/)
    if (olMatch) {
      if (inList !== 'ol') {
        if (inList) output.push('</ul>')
        output.push('<ol>')
        inList = 'ol'
      }
      output.push(`<li>${processInline(olMatch[2])}</li>`)
      i++
      continue
    }

    // Close list if we hit a non-list line
    if (inList && line.trim() === '') {
      output.push(inList === 'ul' ? '</ul>' : '</ol>')
      inList = null
      i++
      continue
    }

    // Empty line
    if (line.trim() === '') {
      i++
      continue
    }

    // Regular paragraph
    if (inList) {
      output.push(inList === 'ul' ? '</ul>' : '</ol>')
      inList = null
    }

    // Collect consecutive non-empty paragraph lines
    const paraLines: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('#') &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].trimStart().startsWith('> ') &&
      !lines[i].match(/^(\s*)[-*+]\s+/) &&
      !lines[i].match(/^(\s*)\d+[.)]\s+/) &&
      !lines[i].match(/^[-*_]{3,}\s*$/)
    ) {
      paraLines.push(lines[i])
      i++
    }

    output.push(`<p>${processInline(paraLines.join('\n'))}</p>`)
  }

  // Close any remaining open list
  if (inList) {
    output.push(inList === 'ul' ? '</ul>' : '</ol>')
  }

  return sanitize(output.join('\n'))
}
