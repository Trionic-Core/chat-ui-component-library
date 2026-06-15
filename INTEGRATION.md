# Integrating `@cypherx/chat-ui`

The client-side renderer for CypherX. It connects to your CypherX backend over
SSE, streams the answer, and renders the agent's **Agentic UI (AUI)** surfaces —
KPI cards, charts, tables, action buttons — from a declarative spec. You write
**no rendering code**: you wire a send function + headers, the library does the
rest.

> Protocol: this renders the **CypherX-native AUI protocol** (a declarative
> `ViewSpec` over an SSE `ui_block` event). It is CypherX's own contract — no
> third-party UI-protocol dependency. See [Extensibility](#extensibility).

---

## 1. Install

```bash
npm install @cypherx/chat-ui
```

Peer dependencies (you likely already have React):

```bash
npm install react react-dom lucide-react motion recharts
```

Import the stylesheet once (ships the default theme tokens + base styles):

```ts
import '@cypherx/chat-ui/styles.css'
```

---

## 2. Quick start (full chat widget)

The fastest integration: a floating chat widget wired to your CypherX endpoint.

```tsx
'use client'
import { ChatProvider, ChatWidget, useSSEStream } from '@cypherx/chat-ui'
import type { ChatEvent } from '@cypherx/chat-ui'
import '@cypherx/chat-ui/styles.css'

const API_BASE = 'https://your-cypherx-host'
const HEADERS = {
  'X-API-Key': '<your enterprise API key>',
  // Tenant/row-level scope enforced by the backend access policies:
  'X-Access-Context': JSON.stringify({ company_id: '36967' }),
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
    headers: HEADERS,
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
    const r = await fetch(`${API_BASE}/v1/enterprise/chat/sessions?limit=50`, { headers: HEADERS })
    const { sessions } = await r.json()
    return sessions.map((s) => ({
      id: s.id, title: s.title || 'Untitled chat',
      messageCount: s.message_count ?? 0,
      createdAt: new Date(s.created_at), updatedAt: new Date(s.updated_at ?? s.created_at),
    }))
  },
  async get(id) {
    const r = await fetch(`${API_BASE}/v1/enterprise/chat/sessions/${id}`, { headers: HEADERS })
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
    await fetch(`${API_BASE}/v1/enterprise/chat/sessions/${id}`, { method: 'DELETE', headers: HEADERS })
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
```

---

## 7. Extensibility

The protocol is built to grow **without you writing rendering code**:

- **New answers / data** using today's blocks (metrics, charts, tables, …) →
  **zero changes**. The agent emits, the library renders.
- **New component types** (e.g. a timeline, a map, a form) → ship in a new
  **library version**; you adopt them with `npm update @cypherx/chat-ui`. Your
  application code does not change — you never author block renderers.
- **Forward-compatible:** an older client that receives a newer block type it
  doesn't know **skips it gracefully** (it won't crash) until you upgrade.

So new CypherX capabilities reach your users by streaming new specs (no app
change) or via a version bump (no app code change) — never a rewrite.

---

## Support

- Types: every export is fully typed (`ViewSpec`, `Block`, `ChatEvent`,
  `SessionAdapter`, …).
- The reference integration is the `chat-ui-demo` app.
