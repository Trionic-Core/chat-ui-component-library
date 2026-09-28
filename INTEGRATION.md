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
> skip the import and define the `--cxc-*` tokens yourself — see
> [THEMING.md](./THEMING.md).

---

## 2. Quick start (full chat widget)

> **Already have your own chat UI?** Jump to **§3 (Just the AUI renderer)** — most
> product integrations only need the renderer, not the full widget.

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
  'X-Access-Context': JSON.stringify({ tenant_id: '<your-tenant-id>' }),
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
`text`, `actions`, `file` (§6). The library validates every block and **skips**
any it can't render — a malformed or unknown block never breaks the message.

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

## 6. File downloads (the `file` block)

When a user asks for a file, the agent can export the answer as a CSV, PDF or
DOCX. The answer then carries a `file` block, and `AuiView` draws a download
card: the format icon, the title or file name, the size, the row count of a
CSV ("First N rows" when the export stopped at its row limit) and "Available
until {date}".

The block has no URL. The library never builds a URL and never sees a
credential. You give it one `files` object with two actions, and your code
makes both requests with the same headers as the chat:

| Route | Use |
|---|---|
| `GET /v1/enterprise/chat/files/{file_id}` | The file bytes. |
| `GET /v1/enterprise/chat/files/{file_id}/status` | The state of the file (`preparing`, `ready`, `failed` or `expired`). |

```tsx
import type { FileHandler, FileStatus } from '@cypherx/chat-ui'

// GET one file route with the chat's headers (X-API-Key, X-Access-Context).
// On an HTTP error, reject with the code as `status`: the card reads 410 as
// "Expired" and 404 as "not available".
async function fileRequest(path: string, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`${API_BASE}/v1/enterprise/chat/files/${path}`, { headers: HEADERS, signal })
  if (!res.ok) throw Object.assign(new Error(`File request failed: ${res.status}`), { status: res.status })
  return res
}

const files: FileHandler = {
  async status(block, signal) {
    const res = await fileRequest(`${encodeURIComponent(block.file_id)}/status`, signal)
    return (await res.json()) as FileStatus
  },
  async download(block) {
    // The request needs headers, so a plain <a href> cannot fetch it.
    const res = await fileRequest(encodeURIComponent(block.file_id))
    const url = URL.createObjectURL(await res.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = block.file_name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  },
}

// Full widget:    <ChatProvider onSend={send} files={files}> … </ChatProvider>
// Renderer only:  <AuiView spec={spec} onSendMessage={onSend} files={files} />
```

What the card does:

| State | The card shows | Download button |
|---|---|---|
| `preparing` | "Preparing…". It reads the status at once, every 2 s for 30 s, then every 10 s. | No |
| `ready` | The size, the rows and "Available until {date}". | Yes |
| `failed` | The sentence from the status route, for example "The export queue is busy. Try again in a few minutes." | No |
| `expired` | "Expired" — `expires_at` is past, the status says `expired`, or the download answered 410. | No |

- The card stops the status reads on `ready`, `failed` or `expired`, and when it
  unmounts. It aborts the read in flight through `signal`.
- A PDF or DOCX arrives `ready`, so the card never reads its status.
- The history replay keeps the first state of a block, so an old CSV says
  `preparing`. The card reads its status once, sees `ready`, and stops.
- While `download` runs, the button is busy. If `download` rejects with another
  code, the card shows "Download failed. Try again." and keeps the button.
- Without `files`, the card shows the details only: no button and no status
  reads.
- The install must have chat file exports turned on. Old clients (0.8.0) skip
  the `file` block and log one warning.

---

## 7. Branding / theming

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

## 8. Extensibility

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

## Support

- Types: every export is fully typed (`ViewSpec`, `Block`, `ChatEvent`,
  `SessionAdapter`, …).
- The reference integration is the `chat-ui-demo` app.
