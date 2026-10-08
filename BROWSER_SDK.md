# CypherX Browser SDK

This ZIP is a self-hosted browser build of the React chat library. It includes
React and the renderer internally. Clients do not need npm, React, a bundler,
a CDN, or a separate stylesheet. No enterprise credentials are included.
`build.json` identifies the exact source revision and component version. This
browser preview is separately identified; it is not an npm release.

For a step-by-step client handoff, start with
[DEVELOPER_INTEGRATION_GUIDE.md](./DEVELOPER_INTEGRATION_GUIDE.md). It covers JSP,
the Java endpoint contract, security, Android WebView, and acceptance testing.

## Try It

Open `examples/index.html` in a modern browser. This is an offline demo with
sample responses, tables, a chart and follow-up buttons; it makes no API calls.

## JSP Installation

1. Extract the ZIP and deploy its contents at a versioned static asset path
   in your Java web application, for example `/assets/cypherx-chat/`.
2. Adapt `examples/chat.jsp` and `examples/jsp-init.js`. The JSP uses Jakarta
   Tags 3 (`jakarta.tags.core`). Older JSTL installations should use their
   configured core URI, commonly `http://java.sun.com/jsp/jstl/core`.
3. Implement or connect your authenticated `/api/chat` endpoint as described
   below. Do not deploy the offline response generator as a real backend.

```html
<div id="chat"></div>
<script src="/assets/cypherx-chat/widget.min.js"></script>
<script>
  const chat = CypherXChat.mount('#chat', {
    endpoint: '/api/chat',
    title: 'Assistant',
    height: '600px'
  });
</script>
```

Under a strict CSP, put initialization in an allowed external script (as in the
JSP example), or nonce the initialization script. Pass that same per-response
nonce as `nonce` to allow the SDK's embedded shadow stylesheet. Allow the chat
endpoint in `connect-src`. Voice playback requires an appropriate `media-src`
(including `blob:`). Test your actual CSP; no unsafe-eval is required.

For native ES modules use `import { mount } from './widget.mjs'` instead of
the global bundle. Load only one build. Use HTTP(S) for module examples and
real endpoints; local file mode is only for the offline classic-script demo.

## API

For an existing JSP chat interface that needs only Markdown, use
`markdown.min.js` and `markdown.css` instead of the full widget. The small bundle
contains no React runtime. Call `CypherXMarkdown.renderMarkdown(text)` and place
the returned HTML inside an element with `class="cxc-markdown"`. Unlike the full
widget, this mode uses scoped ordinary CSS, not Shadow DOM, and does not provide
streaming, input controls, sessions, or charts. Keep the JS/CSS pair together.

```html
<link rel="stylesheet" href="/assets/cypherx-chat/markdown.css">
<div id="answer" class="cxc-markdown"></div>
<script src="/assets/cypherx-chat/markdown.min.js"></script>
<script>
  document.getElementById('answer').innerHTML =
    CypherXMarkdown.renderMarkdown('**Ready**');
</script>
```

`CypherXChat.version` reports the build. `mount(elementOrSelector, options)`
returns a handle synchronously. The mount target must exist in the current
document. Existing children are preserved. One instance is allowed per target;
independent targets can host multiple instances. See `widget.d.ts` for types.

| Option | Meaning |
| --- | --- |
| `endpoint` | POST SSE endpoint; mutually exclusive with `onSend` |
| `onSend` | Custom async generator `(message, sessionId, metadata, signal)` yielding ChatEvents; honor the abort signal |
| `headers` | Header object or a function returning one (possibly asynchronously), called per request; use for CSRF or short-lived user tokens |
| `credentials` | Fetch credentials policy, default `same-origin` |
| `buildBody`, `parseEvent` | Optional request and SSE event adapters |
| `mode` | `inline` (default) or floating `widget` |
| `position`, `defaultOpen` | Floating widget position (`bottom-right`/`bottom-left`) and initial visibility |
| `theme` | `light` (default), `dark`, or `auto` following system preference |
| `title`, `placeholder`, `width`, `height` | Presentation options; width applies to the floating panel |
| `themeTokens` | Map of `--cxc-*` CSS token overrides, applied inside the shadow root |
| `initialMessages`, `initialSessionId` | Restore a conversation; timestamps must be JavaScript Date objects |
| `sessionAdapter`, `showSessions` | Existing session CRUD adapter and inline session navigation |
| `feedback`, `voice`, `voiceStatus`, `enableRegenerate` | Existing optional React-library adapters/features; no endpoints are guessed |
| `autoFocus`, `maxInputLength` | Defaults: false and 10000 characters |
| `onEvent`, `onStateChange` | Notifications with cloned data; do not include chat content in analytics without consent |
| `nonce` | CSP nonce for the embedded stylesheet |

Handle methods: `send(text, metadata?)`, `stop()`, `clear()`, `setInput(text)`,
`getState()`, `open()`, `close()`, `update({theme,title,placeholder,width,height})`,
and `destroy()`. `open/close` control the floating panel. `clear` stops streaming
and starts a new conversation. `destroy` is idempotent, aborts the SDK request,
unmounts the UI and removes only SDK-owned DOM. Other methods reject after
destruction. Call it before replacing a JSP/AJAX panel; remount is then allowed.
`send` rejects empty, over-limit, or concurrent requests. `getState` is a copy.

DOM notifications `cypherx:event` and `cypherx:state` bubble from `handle.element`.
The SDK holds conversation state in memory only and does not use localStorage.
Custom transport/voice/session callbacks own their network work and must implement
the cancellation and authorization required by the host application.

## Java Endpoint Contract

The browser POSTs JSON `{ "message": "...", "session_id": null }` plus optional
top-level metadata. The endpoint must authenticate the user's session, enforce
CSRF, and derive authorized tenant scope on the server. Never trust a browser
tenant ID for authorization. Keep enterprise API keys on the Java server.

Return `Content-Type: text/event-stream` and UTF-8, forwarding and flushing
events as they arrive. Disable servlet/reverse-proxy response buffering and
ensure suitable stream timeouts. Close the upstream request on client disconnect.
Do not return a buffered JSON response or an HTML login redirect for API errors.

```text
event: token
data: {"text":"Hello"}

event: done
data: {"session_id":"session-123","message_id":"message-456"}

```

Each frame ends with a blank line. `done` (or `data: [DONE]`) completes a reply.
An unexpected EOF is reported as an incomplete response, not silently accepted.
Also supported: `thinking`, `reasoning`, `action`, `action_update`, `followups`,
`ui_block` (the same validated ViewSpec contract as React), and `error`.
Multiple `data:` lines, CR/LF/CRLF boundaries, comments and split UTF-8 chunks
are parsed by eventsource-parser. Automatic retries are intentionally disabled:
retrying a POST may duplicate a backend turn. The user can retry explicitly.

Cross-origin endpoints require explicit CORS configuration. Credentialed requests
require an exact allowed origin and `Access-Control-Allow-Credentials: true`;
the default recommendation is a same-origin Java proxy.

## Isolation and Browser Support

Each instance renders the existing React components into an open Shadow DOM.
Styles and theme tokens are installed inside that tree; do not load the full
React stylesheet into the JSP document. Ordinary host CSS does not enter the
widget and widget resets do not restyle the host page. Host rules that hide,
clip, transform or resize the mounting element still matter. Shadow DOM is a
style boundary, not a security sandbox. For independently trusted apps, use an
appropriately secured iframe integration instead.

Use current Chromium, Firefox and Safari/WebKit with Shadow DOM, ResizeObserver,
fetch streaming and structuredClone. No IE or legacy Android WebView support is
claimed. Voice requires HTTPS, microphone permission and WebView/native permission
bridging where applicable; real-device audio routing is not a browser-bundle test.
The SDK does not fetch external fonts. Wide tables scroll inside messages.

## Updates and Verification

Deploy the entire versioned directory atomically and change the script URL to
that version. Do not mix bundles from different ZIPs. Verify `SHA256SUMS` after
extraction and retain `LICENSE` and `THIRD-PARTY-NOTICES.txt` when redistributing.
Report the SDK version, browser/WebView version, container dimensions and a
redacted failing response when requesting support. Do not send session cookies,
API keys or access tokens.

The repository provides unit/contract tests, React layout tests and browser-SDK
tests that serve the actual ZIP contents without Vite, npm resolution or a CDN.
Client acceptance must additionally check their authenticated Java proxy, CSP,
session policy and any enabled voice endpoints in their deployment.
