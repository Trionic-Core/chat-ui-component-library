# Integrating `@cypherx/chat-ui`

The client-side renderer for CypherX. It connects to your CypherX backend over
SSE, streams the answer, and renders the agent's **Agentic UI (AUI)** surfaces —
KPI cards, charts, tables, action buttons — from a declarative spec. You write
**no rendering code**: you wire a send function + headers, the library does the
rest.

> Protocol: this renders the **CypherX-native AUI protocol** (a declarative
> `ViewSpec` over an SSE `ui_block` event). It is CypherX's own contract — no
> third-party UI-protocol dependency. See [Extensibility](#extensibility).

> **Requires** a CypherX Enterprise backend on **v3.5.11 or later** — the version
> that emits AUI `ui_block` surfaces and persists them for history replay. On an
> older backend the wiring below is harmless but no surfaces will appear.

---

## 1. Install

`@cypherx/chat-ui` is a **private** package. CypherX issues you a **read-only
access token** during onboarding — keep it secret (treat it like a password).

**a. Configure the registry.** Add a `.npmrc` to your project root. Reference the
token via an environment variable so it never gets committed:

```ini
# .npmrc  (safe to commit — the token comes from the environment)
@cypherx:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

**b. Provide the token** via your shell / CI secret store (never hard-code it in
a file you commit):

```bash
export NPM_TOKEN=<the read-only token CypherX gave you>
```

**c. Install:**

```bash
npm install @cypherx/chat-ui
```

Peer dependencies — just **React** (everything else is bundled):

```bash
npm install react react-dom
```

Import the stylesheet once (ships the default theme tokens + base styles):

```ts
import '@cypherx/chat-ui/styles.css'
```

> **Tailwind v3 users:** importing this compiled stylesheet can conflict
> (`@layer base` with no matching `@tailwind base`). If you hit that build error,
> serve the compiled `dist/styles.css` as a static asset and load it with a
> `<link rel="stylesheet">` outside the Tailwind v3 preprocessing pipeline.
> Do **not** omit the stylesheet: theme tokens alone do not supply layout rules.
> Custom pages using only `renderMarkdown()` can instead import
> `@cypherx/chat-ui/markdown.css`, which is scoped, layer-free CSS and does not
> include the full chat widget or AUI styles.

---

## 2. Quick start (full chat widget)

Browser integrations must call an authenticated same-origin server proxy.
Keep enterprise API keys and trusted tenant scope on that server, never in
React/JSP source or browser headers. The `/api/cypherx` prefix below is an
example proxy route your backend implements, not a route installed by this
package. Use context-path-aware URLs if your app is deployed below `/`.
For the standalone JSP SDK, follow [DEVELOPER_INTEGRATION_GUIDE.md](./DEVELOPER_INTEGRATION_GUIDE.md).

> **Already have your own chat UI?** Jump to **§3 (Just the AUI renderer)** — most
> product integrations only need the renderer, not the full widget.

The fastest integration: a floating chat widget wired to your CypherX endpoint.

```tsx
'use client'
import { ChatProvider, ChatWidget, useSSEStream } from '@cypherx/chat-ui'
import type { ChatEvent } from '@cypherx/chat-ui'
import '@cypherx/chat-ui/styles.css'

const API_BASE = '/api/cypherx'
function getHeaders(): Record<string, string> {
  // Adapt these meta tags to your application's CSRF framework.
  const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content
  const header = document.querySelector<HTMLMetaElement>('meta[name="csrf-header"]')?.content
  return token && header ? { [header]: token } : {}
}

// Map CypherX SSE events -> the library's ChatEvent union (see §4).
function parseEvent(eventType: string, data: string): ChatEvent | null {
  const p = JSON.parse(data)
  switch (eventType) {
    case 'token':     return { type: 'token', text: String(p.text ?? '') }
    case 'ui_block':  return { type: 'ui_block', spec: p.spec ?? p } // AUI surface
    case 'followups': return { type: 'followups', followups: {
      label: String(p.label ?? ''),
      options: Array.isArray(p.options) ? p.options.map(String) : [],
      multi: Boolean(p.multi),
    } }
    case 'done':      return { type: 'done', sessionId: p.session_id, messageId: p.message_id }
    case 'error':     return { type: 'error', message: String(p.detail ?? p.message ?? 'Error') }
    default:          return null
  }
}

export function CypherXChat() {
  const send = useSSEStream({
    url: `${API_BASE}/v1/enterprise/chat`,
    headers: getHeaders,
    buildBody: (message, sessionId) => ({ message, session_id: sessionId }),
    parseEvent,
  })

  return (
    <ChatProvider onSend={send} placeholder="Ask about your data…">
      <ChatWidget position="bottom-right" fabLabel="Ask AI" />
    </ChatProvider>
  )
}
```

That's a complete integration: streaming answers + auto-rendered KPI cards,
charts, and tables.

---

## 3. Just the AUI renderer (embed surfaces yourself)

If you have your own chat shell and only want to render the agent's surfaces,
use `AuiView` directly. The backend sends a `ui_block` event whose payload is a
`ViewSpec`; render it:

```tsx
import { AuiView, isValidViewSpec } from '@cypherx/chat-ui'
import type { ViewSpec } from '@cypherx/chat-ui'
import '@cypherx/chat-ui/styles.css'

function AgentMessage({ specs, onSend }: { specs: ViewSpec[]; onSend: (m: string) => void }) {
  return (
    <>
      {specs.filter(isValidViewSpec).map((spec) => (
        <AuiView key={spec.surface_id} spec={spec} onSendMessage={onSend} />
      ))}
    </>
  )
}
```

`AuiView` renders the whole surface (metric groups, charts, tables, text,
actions). `onSendMessage` is called when a user clicks an action button — pass it
back into your send function to drive the next turn.

---

## 4. The event protocol

Your `parseEvent` maps CypherX's SSE events to the library's `ChatEvent` union.
The ones that matter:

| SSE event   | ChatEvent                              | Renders as |
|-------------|----------------------------------------|------------|
| `token`     | `{ type: 'token', text }`              | streamed answer text |
| `action`    | `{ type: 'action', action }`           | live "working…" status |
| `ui_block`  | `{ type: 'ui_block', spec }`           | **AUI surface** (cards/charts/tables) |
| `followups` | `{ type: 'followups', followups }`     | suggested next-question chips |
| `done`      | `{ type: 'done', sessionId, messageId }`| finalizes the turn |
| `error`     | `{ type: 'error', message }`           | inline error |

A `ViewSpec` (the `ui_block` payload) is `{ surface_id, version, title?, blocks[] }`.
Each block is one of a **closed catalog**: `metric_group`, `chart`, `table`,
`text`, `actions`. The library validates every block and **skips** any it can't
render — a malformed or unknown block never breaks the message.

---

## 5. Chat history (sessions)

Pass a `sessionAdapter` to enable the history dropdown (list, load, delete, new):

```tsx
import type { SessionAdapter } from '@cypherx/chat-ui'

const sessions: SessionAdapter = {
  async list() {
    const r = await fetch(`${API_BASE}/v1/enterprise/chat/sessions?limit=50`, { headers: getHeaders() })
    const { sessions } = await r.json()
    return sessions.map((s) => ({
      id: s.id, title: s.title || 'Untitled chat',
      messageCount: s.message_count ?? 0,
      createdAt: new Date(s.created_at), updatedAt: new Date(s.updated_at ?? s.created_at),
    }))
  },
  async get(id) {
    const r = await fetch(`${API_BASE}/v1/enterprise/chat/sessions/${encodeURIComponent(id)}`, { headers: getHeaders() })
    const { session, messages } = await r.json()
    return {
      session: { id: session.id, title: session.title || 'Untitled chat',
        messageCount: session.message_count ?? 0,
        createdAt: new Date(session.created_at), updatedAt: new Date(session.updated_at) },
      messages: messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: m.id, role: m.role, content: m.content ?? '',
          timestamp: new Date(m.created_at), backendMessageId: m.id,
          // History replays the rendered surfaces too:
          ...(Array.isArray(m.ui_blocks) && m.ui_blocks.length ? { blocks: m.ui_blocks } : {}),
        })),
    }
  },
  async delete(id) {
    await fetch(`${API_BASE}/v1/enterprise/chat/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', headers: getHeaders() })
  },
}

// <ChatProvider onSend={send} sessionAdapter={sessions}> … render <SessionSelector/> in the header.
```

---

## 6. Branding / theming

Everything visible — colors, typography, radius, shadows, and the **chart
palette** — is a CSS variable (`--cxc-*`). Override them under your own scope to
match the client brand; no component changes. See **[THEMING.md](./THEMING.md)**
for the full token reference. Minimal example:

```css
:root {
  --cxc-accent: #4f46e5;
  --cxc-font-sans: 'Brand Sans', system-ui, sans-serif;
  --cxc-chart-1: #4f46e5;  /* … --cxc-chart-8 brand the data viz */
}

/* The chart palette is defined per theme. Override the dark set too, or your
   light hexes paint on the dark surface. */
.dark {
  --cxc-chart-1: #8b85f5;
}
```

If you override the chart palette, validate it — contrast against each surface
and colour-vision-deficiency separation between adjacent slots. THEMING.md
§"Chart palette" gives the two checks and the thresholds.

---

## 7. Extensibility

The protocol is built to grow **without you writing rendering code**:

- **New answers / data** using today's blocks (metrics, charts, tables, …) →
  **zero changes**. The agent emits, the library renders.
- **New component types** (e.g. a timeline, a map, a form) → ship in a new
  **library version**; you adopt them with `npm update @cypherx/chat-ui`. Your
  application code does not change — you never author block renderers.
- **Theming stays automatic** when you `import '@cypherx/chat-ui/styles.css'`: a
  new block's tokens ship *with* the upgrade — no token edits. (Only hand-defined
  `--cxc-*` setups need to add the new vars.)
- **Forward-compatible:** an older client that receives a newer block type it
  doesn't know **skips it gracefully** (it won't crash) until you upgrade.

So new CypherX capabilities reach your users by streaming new specs (no app
change) or via a version bump (no app code change) — never a rewrite.

---

## Markdown Layout Diagnostics

For JSP/plain HTML consumers wanting the complete chat UI, use the
self-contained browser SDK described in [BROWSER_SDK.md](./BROWSER_SDK.md).
It bundles React and CSS inside a Shadow DOM rather than requiring copied
Markdown functions or global stylesheet imports.

Updating the npm dependency alone is not enough if the application still serves
an older copied CSS file. Update the JS and CSS together and invalidate cached
assets. For the full widget use `@cypherx/chat-ui/styles.css`; for custom Markdown
bubbles use `@cypherx/chat-ui/markdown.css`. Do not maintain a copied
`renderMarkdown()` implementation that can drift from the package.

```tsx
import { renderMarkdown } from '@cypherx/chat-ui'
import '@cypherx/chat-ui/markdown.css'

<div className="cxc-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
```

Generated tables style themselves through `.cxc-table-scroll`; the outer
`.cxc-markdown` applies the other Markdown styles. The standalone stylesheet is
plain CSS and can also be served as a static asset in JSP. Theme overrides still
work through `--cxc-*`; layout rules are not replaced by theme tokens.

When reporting a layout issue, include `npm ls @cypherx/chat-ui`, the original
Markdown, the rendered element HTML, viewport/container width, stylesheet
imports, and the following browser-console output. Do not include auth tokens.

```js
const table = document.querySelector('.cxc-table-scroll')
if (table) {
  const cell = table.querySelector('th, td')
  const css = getComputedStyle(table)
  const cellCss = cell && getComputedStyle(cell)
  console.table({
    styleVersion: css.getPropertyValue('--cxc-markdown-style-version').trim(),
    visibleWidth: table.clientWidth,
    contentWidth: table.scrollWidth,
    overflowX: css.overflowX,
    cellMinWidth: cellCss?.minWidth,
    cellPadding: cellCss?.padding,
    cellBorder: cellCss?.border,
    cellAlignment: cellCss?.verticalAlign,
  })
}
```

The hardened stylesheet reports style version `2`. A missing marker means the
CSS is missing or stale. Zero padding/borders or a missing `12rem` cell minimum
indicates missing/overridden table rules. Content wider than the visible width
is expected for wide tables, provided `overflow-x` is `auto` and the region can
scroll to its final column. Flex message children need `min-width: 0`; grid
message tracks need `minmax(0, 1fr)`. Deliberate higher-specificity or `!important`
host overrides cannot be prevented by a normal shared stylesheet.

Run `npm run build` and `npm run test:layout` before releasing layout changes.
Install the browser runtimes once with `npx playwright install chromium webkit`.
The suite exercises shipped assets in Chromium/WebKit and covers custom
renderers, full/standalone styles, common host resets, mobile/desktop, flex/grid,
large text, themes, streaming, keyboard access, long content and host-page scroll
containment. Failure screenshots/traces are attached to CI.

## Support

- Types: every export is fully typed (`ViewSpec`, `Block`, `ChatEvent`,
  `SessionAdapter`, …).
- The reference integration is the `chat-ui-demo` app.
