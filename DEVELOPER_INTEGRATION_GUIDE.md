# CypherX Chat: Developer Integration Guide

Audience: frontend/JSP developers, Java backend developers, QA, and Android
developers embedding the web page in a WebView.

This guide covers the self-hosted browser SDK delivered as a ZIP. Use the
`version` in the accompanying `build.json` to identify your release. A browser
SDK preview is not an npm release, and the ZIP does not include your Java
backend or enterprise credentials.

Start with [deployment](#3-inspect-and-deploy-the-zip),
[JSP setup](#4-add-chat-to-a-jsp-page), and the
[Java endpoint](#5-implement-the-java-streaming-endpoint). Before release, use
the [acceptance checklist](#11-acceptance-checklist). For an existing issue,
jump to [troubleshooting](#12-troubleshooting-and-upgrades).

## 1. Choose the Integration

| Your application | Use | Styles |
| --- | --- | --- |
| JSP/plain HTML needing the complete chat UI | `widget.min.js` and `CypherXChat.mount()` | Embedded in the script; no additional chat CSS |
| An existing custom chat UI needing only formatted Markdown | `markdown.min.js` and `CypherXMarkdown.renderMarkdown()` | Also load `markdown.css` |
| React using the existing component package | Continue using `@cypherx/chat-ui` | Import the matching package stylesheet |
| Android app displaying a JSP/web page | Browser SDK in the page, with WebView configuration | Same as the browser SDK |

For JSP, **start with the complete browser SDK** unless you already maintain
your own chat interface. React is bundled internally; the integrating team
does not install React, npm, Tailwind, or a frontend build tool.

Do not copy the React `renderMarkdown()` implementation into a JSP project.
Use the shipped renderer so fixes can be adopted by replacing the distribution.
JSP runs on the Java server; this JavaScript runs in the user's browser.

## 2. Agree on Responsibilities

```text
JSP page + CypherX browser SDK
          |
          | authenticated POST /api/chat, streamed SSE response
          v
Client's Java application / proxy
          |
          | server-held enterprise credentials and authorized tenant scope
          v
CypherX backend
```

| Owner | Required work |
| --- | --- |
| Frontend/JSP | Host SDK files, mount the widget, supply the endpoint and current CSRF headers, clean up on navigation |
| Java backend | Authenticate the user, authorize each session/tenant, proxy the request, stream events, cancel upstream work on disconnect |
| Infrastructure | HTTPS, static asset MIME types, CSP/CORS configuration, proxy buffering and stream timeouts |
| Android | Current WebView, trusted HTTPS origin, navigation policy, and native microphone handling if voice is enabled |
| QA | Run the acceptance checklist against the client's actual environment |

Before starting, confirm the application context path, chosen chat endpoint,
authentication/CSRF mechanism, supported browsers, and whether history, feedback,
or voice are required. `/api/chat` below is a route your Java team supplies,
not an endpoint installed by the SDK.

## 3. Inspect and Deploy the ZIP

1. Extract the ZIP and open `examples/index.html` in a modern browser. Send a
   message and check the sample table, chart, and follow-up buttons. This is an
   **offline demo**, not a connection to your enterprise backend.
2. Read `build.json` and retain `LICENSE`, `THIRD-PARTY-NOTICES.txt`, and
   `SHA256SUMS`. On macOS/Linux, run `shasum -a 256 -c SHA256SUMS` from the
   extracted release directory to verify the contents.
3. Deploy the extracted contents to a versioned public static directory, for
   example `/assets/cypherx-chat/RELEASE_ID/`. Replace `RELEASE_ID` in this guide
   with the actual `build.json` version; do not use the placeholder literally.
4. Verify that the script URL returns JavaScript, not an HTML login page or
   a 404. Use your Java framework's static-resource mapping; JSP locations
   under `WEB-INF` are not public static resource locations.

Relevant files:

```text
RELEASE_ID/
  widget.min.js                 Complete SDK, global CypherXChat
  widget.mjs                    Alternative standalone ES module
  widget.d.ts                   API types for developers
  markdown.min.js               Markdown-only alternative
  markdown.css                  Styles for the Markdown-only alternative
  build.json                    Version, source revision, dependencies
  README.md                     SDK API reference
  DEVELOPER_INTEGRATION_GUIDE.md This guide
  LICENSE
  THIRD-PARTY-NOTICES.txt
  SHA256SUMS
  examples/
    index.html                  Offline demonstration
    chat.jsp                    Starting JSP template
    jsp-init.js                 Starting initialization script
```

Deploy both JavaScript builds if retaining the whole release, but load **only
one** on a page. Normal JSP usage needs only `widget.min.js`; `widget.mjs` is
for consumers using native module imports over HTTP(S).

## 4. Add Chat to a JSP Page

Use the following page structure. The server must supply `cspNonce` if your CSP
uses nonces. `_csrf` below is Spring Security's request attribute; adapt the
two CSRF meta tags for your security framework rather than disabling CSRF.

```jsp
<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ taglib prefix="c" uri="jakarta.tags.core" %>
<c:set var="chatAssets" value="/assets/cypherx-chat/RELEASE_ID" />
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Support Chat</title>
  <meta name="csrf-token" content="<c:out value='${_csrf.token}'/>">
  <meta name="csrf-header" content="<c:out value='${_csrf.headerName}'/>">
</head>
<body>
  <div id="chat" data-endpoint="<c:url value='/api/chat'/>"></div>
  <script nonce="<c:out value='${cspNonce}'/>"
          src="<c:url value='${chatAssets}/widget.min.js'/>"></script>
  <script nonce="<c:out value='${cspNonce}'/>"
          src="<c:url value='/assets/app/chat-init.js'/>"></script>
</body>
</html>
```

This tag URI requires Jakarta Tags 3. For an older JSTL application, use the
core URI configured by your application, commonly
`http://java.sun.com/jsp/jstl/core`. The SDK itself is independent of JSTL.

`<c:url>` includes the application context path. For example, an application
deployed at `/portal` gets `/portal/api/chat`, not `/api/chat` at the server root.
Place scripts after the mount element, in this order. Do not add `async`.

Create your application's external `/assets/app/chat-init.js`:

```javascript
const target = document.getElementById('chat');
const styleNonce = document.currentScript?.nonce || undefined;

const chat = CypherXChat.mount(target, {
  endpoint: target.dataset.endpoint,
  mode: 'inline',
  title: 'Assistant',
  placeholder: 'Ask a question',
  height: 'min(700px, 90dvh)',
  theme: 'light',
  credentials: 'same-origin',
  nonce: styleNonce,
  headers: function () {
    const token = document.querySelector('meta[name="csrf-token"]')?.content;
    const header = document.querySelector('meta[name="csrf-header"]')?.content;
    return token && header ? { [header]: token } : {};
  }
});

window.addEventListener('pagehide', function (event) {
  if (!event.persisted) chat.destroy();
});
```

Keep this application-owned script outside the SDK's release directory so an
SDK upgrade does not overwrite your endpoint configuration. The `headers`
function is called for every request; if the server rotates the CSRF token,
update the meta tag or read from your application's live token provider.
Do not hard-code an enterprise API key in this script, JSP, or HTML attributes.

Expected first result: the empty chat UI and input appear, with no external
React/CDN downloads. Sending requires the Java endpoint in the next section.

## 5. Implement the Java Streaming Endpoint

The default transport uses `fetch` with **POST**, not browser `EventSource`.
The request is:

```http
POST /portal/api/chat
Content-Type: application/json
Accept: text/event-stream

{"message":"Show sales by product","session_id":null}
```

The browser also sends permitted same-origin session cookies and the configured
CSRF header. After a successful `done` event supplies a session ID, subsequent
requests reuse it as `session_id`. Calling `chat.clear()` starts a fresh local
conversation; it does not delete server-side history.

Return HTTP 200 and `Content-Type: text/event-stream; charset=UTF-8`, then write
and flush frames as data arrives. Use `Cache-Control: no-cache`. A minimal
successful response looks like this:

```text
event: token
data: {"text":"Here is the summary.\n\n"}

event: token
data: {"text":"| Product | Revenue |\n| --- | --- |\n| Notebook | 1800 |"}

event: done
data: {"session_id":"session-123","message_id":"message-456"}

```

Every frame, **including the final frame**, ends with a blank line (`\n\n`).
Within a JSON string, encode Markdown newlines as `\n` using a JSON serializer;
do not construct JSON by concatenating user content.

Java implementation requirements:

1. Validate the user's session and CSRF token before opening the stream.
2. Resolve the tenant and access permissions on the server. Authorize supplied
   `session_id` values; neither browser metadata nor a session ID proves access.
3. Call the agreed upstream endpoint with credentials from server configuration
   or a secret store. Do not forward arbitrary browser-provided authorization
   or tenant headers as trusted enterprise credentials.
4. Forward valid SSE frames as they arrive. Use your framework's streaming
   support, such as Spring MVC `SseEmitter`, WebFlux, or Servlet async I/O.
   Do not collect the complete answer into a normal JSON response first.
5. Flush writes, disable reverse-proxy buffering on the streaming route, and
   set appropriate upstream/servlet/proxy timeouts. SSE comments such as
   `: keepalive\n\n` can maintain an otherwise idle connection.
6. End with `done` or `data: [DONE]\n\n`. If generation fails after streaming
   starts, send an `error` frame with a user-safe message and close the stream.
7. Cancel the upstream request on client disconnect, timeout, or cancellation.
   Clicking Stop aborts the browser request; Java must propagate cancellation.

Before streaming starts, return an appropriate 401/403/429/5xx status for
errors. API authentication failure must not redirect to an HTML login page.
After streaming starts, the HTTP status is already committed; use an SSE error:

```text
event: error
data: {"message":"The service is temporarily unavailable.","code":"UPSTREAM_UNAVAILABLE"}

```

An unexpected connection close without `done` or `error` is shown as an
incomplete response. The SDK does not automatically retry POSTs because that
could create duplicate backend turns.

### Optional Events

| Wire event | `data` JSON | Purpose |
| --- | --- | --- |
| `token` | `{"text":"Hello"}` | Append Markdown text |
| `thinking` | `{"active":true}` | Accepted by the protocol; thinking UI is derived from message state |
| `reasoning` | `{"text":"User-visible explanation"}` | Append an explanation, only when appropriate for users |
| `action` | `{"id":"a1","action_type":"search","label":"Searching","status":"running"}` | Display task progress |
| `action_update` | `{"action_id":"a1","status":"completed"}` | Update task progress |
| `followups` | `{"label":"Explore further","options":["Show products"],"multi":false}` | Suggested replies |
| `ui_block` | `{"spec":{...}}` | Valid CypherX `ViewSpec` for charts, metrics, or structured tables |
| `done` | `{"session_id":"s1","message_id":"m1"}` | Complete the turn and record backend identifiers |
| `error` | `{"message":"Safe explanation","code":"ERROR_CODE"}` | Terminate the failed turn |

Send follow-ups and UI blocks **before** `done`; it terminates the stream.
The `{...}` above denotes a complete ViewSpec, not a literal payload. For a
concrete chart shape, see `examples/demo.js`. Markdown tables need only `token`
events, but charts require structured UI blocks. Optional UI features also
depend on the upstream backend's capabilities.

## 6. Authentication, CSP, and CORS

Prefer a same-origin Java proxy. It avoids cross-origin cookie restrictions
and keeps enterprise credentials out of browser code. Browser-side credentials
should be user-scoped session cookies or short-lived user tokens, never a
long-lived enterprise key.

For a nonce-based CSP, generate a cryptographically random nonce on the server
for each HTML response, set its request attribute, and use the identical value
in the response header and script tags. The initializer passes it to `mount`
for the SDK's embedded stylesheet. A starting policy for a text-chat-only page:

```text
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-NONCE_VALUE'; style-src 'self' 'nonce-NONCE_VALUE'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'
```

Replace `NONCE_VALUE` per response; never deploy that literal string or a static
nonce. Merge the necessary directives into your application's existing policy
and test it; this example is not a universal application security policy.
Do not add `unsafe-eval` or disable CSP to make the widget work. If voice is
enabled, configure the required `media-src`, including `blob:` for playback.

If a cross-origin endpoint is unavoidable, configure its allowed origin
explicitly. Cookie-based cross-origin requests require `credentials: 'include'`,
`Access-Control-Allow-Credentials: true`, an exact allowed origin (not `*`),
and a working OPTIONS preflight for POST and the requested headers. Cookie
SameSite/Secure and browser third-party-cookie policies also apply; CORS alone
does not make cross-origin cookies work. Retain CSRF protection.

## 7. Layout, Themes, and Lifecycle

The complete SDK uses Shadow DOM, isolating its CSS from ordinary host rules.
Do not import the React package's `styles.css` or `markdown.css` for this mode.
Wide tables intentionally scroll **inside the message** instead of compressing
every column to fit a narrow screen.

Give the host container real available width. For a flex parent, use
`min-width: 0` on the chat's flex item; for grid, prefer `minmax(0, 1fr)` for its
track. Avoid a hidden/zero-size mount target. Host ancestors with clipping,
transforms, or restrictive dimensions can still affect a floating widget.
Shadow DOM isolates styles; it is not a security sandbox.

Presentation can change without remounting:

```javascript
chat.update({ theme: 'auto', title: 'Support', height: '650px' });
```

For a floating chat, change the initial mount options to `mode: 'widget'`,
`position: 'bottom-right'`, `width: '420px'`, and `height: '600px'`.
`defaultOpen: false` shows a launcher first. Width applies to the floating
panel; an inline chat uses its container width. Use `chat.open()` and
`chat.close()` to control a floating panel.

| Handle method | Use |
| --- | --- |
| `send(text, metadata?)` | Start a turn; throws for blank, over-limit, or concurrent sends |
| `stop()` | Cancel the active reply |
| `setInput(text)` | Fill the draft without sending it |
| `getState()` | Read a cloned state snapshot; changing it does not change the UI |
| `clear()` | Stop and clear the local conversation, including its active session ID |
| `update(...)` | Change only theme, title, placeholder, width, and height |
| `destroy()` | Abort, unmount, and remove SDK-owned DOM; safe to call again |

Keep the handle in your page/controller. Call `destroy()` before replacing an
AJAX/JSP panel or removing its target. Mount once per target; a destroyed target
can be mounted again. Change endpoint, transport, adapters, or theme tokens by
destroying and remounting, not through `update()`.

Use `themeTokens` at mount time for supported `--cxc-*` CSS variables. If your
application supports both light and dark themes, check brand-color contrast in
both. `onEvent` and `onStateChange` are optional notifications, not a reason to
log private chat content. Keep notification handlers lightweight and avoid
calling synchronous lifecycle APIs from inside state-change callbacks.

## 8. History, Feedback, and Voice

These are opt-in integrations, not endpoints automatically supplied by the ZIP.
Refer to the accompanying `widget.d.ts` for precise adapter types.

| Feature | What the client supplies |
| --- | --- |
| Restore the current conversation | `initialSessionId` and `initialMessages`; convert message timestamps to JavaScript `Date` objects |
| History UI | `sessionAdapter.list()`, plus `get`, `create`, `delete`, and `rename` as needed; `showSessions: true` enables inline session navigation |
| Feedback | `feedback.submit(backendMessageId, feedback)` and `feedback.remove(backendMessageId)` |
| Voice playback | `voice.synthesize(backendMessageId)` returning an audio `Blob` |
| Dictation | `voice.transcribe(file, language?)` returning a transcription; configure the installation's language catalog through `voiceStatus` if needed |
| Regenerate/edit | `enableRegenerate: true` and backend support for regeneration metadata |

The chat transport's headers/credentials are **not automatically added to
network requests inside your adapters**. Each adapter must authenticate,
handle non-2xx responses, and authorize its session/message IDs independently.
Supply `message_id` in `done` for features that use persisted backend messages.
The SDK does not persist conversation state in localStorage.

Use the SDK's default endpoint transport first. For another protocol, pass a
custom asynchronous-generator `onSend(message, sessionId, metadata, signal)`
instead of `endpoint`, never both. That generator must yield typed ChatEvents
and honor the abort signal for its own network work. Do not assume a normal
JSON endpoint or WebSocket works without such an adapter.

## 9. Existing Custom UI: Markdown Only

Use this alternative only when your team owns the chat shell, input, streaming,
and lifecycle. It does not include charts, sessions, or the complete widget.

```html
<link rel="stylesheet" href="/assets/cypherx-chat/RELEASE_ID/markdown.css">
<div id="answer" class="cxc-markdown"></div>
<script src="/assets/cypherx-chat/RELEASE_ID/markdown.min.js"></script>
```

In an allowed external application script:

```javascript
document.getElementById('answer').innerHTML =
  CypherXMarkdown.renderMarkdown('| Item | Value |\n| --- | --- |\n| Sales | 1800 |');
```

Replace `RELEASE_ID` and make the asset URLs context-path-aware using `<c:url>`
in JSP. Pass raw Markdown to the renderer, not already-rendered HTML. During
streaming, render the accumulated Markdown text rather than treating each
partial token as a complete table. Do not insert raw model/user HTML directly.

Keep the Markdown JS and CSS from the same release. Unlike the full SDK,
Markdown-only mode uses ordinary scoped CSS: aggressive host `table`, `td`,
`th`, or `!important` rules can override it. Resolve those host conflicts or
adopt the complete Shadow DOM widget instead of maintaining copied CSS fixes.

## 10. Android WebView Notes

The ZIP provides a web component integration, not a native Android SDK.
Validate on your supported real devices and Android System WebView versions;
desktop Chromium tests are not a substitute for WebView/device testing.

- Load the trusted HTTPS page and enable JavaScript for it. Do not disable
  certificate validation or enable broad file access/mixed content as a fix.
- Confirm login cookies, navigation/back behavior, keyboard resizing, and the
  Android app's lifecycle when the WebView is destroyed or recreated.
- Voice needs Android microphone permission **and** a scoped WebView permission
  grant for the trusted origin's audio-capture request. Do not grant every
  requested WebView resource or every origin automatically.
- Test speaker, earpiece, Bluetooth, microphone start/stop, permission denial,
  background/resume, and interruption behavior if voice is enabled.
- `audio_manager_android.cc: Unable to select communication device` is an
  Android/Chromium audio-routing log. By itself it does not identify a Java
  backend error or prove an SDK failure. Correlate it with the failed user
  action, device/WebView version, permission state, and selected audio device.

Start acceptance with text chat, then add voice once the text/backend path works.

## 11. Acceptance Checklist

Run these in the deployed client environment, not only in the offline demo:

- [ ] SDK asset URLs return 200 with the right content type; the displayed
  `CypherXChat.version` matches the intended `build.json`.
- [ ] Authenticated sending streams progressively; errors do not return an
  HTML login page or reveal server stack traces.
- [ ] The second turn reuses the session ID; Clear starts a new local session.
- [ ] Stop and navigation cancel the browser request and upstream backend work.
- [ ] Long Markdown tables remain readable and horizontally scrollable at
  320px, approximately 400px, tablet, and desktop widths.
- [ ] Long URLs/code, charts, follow-ups, and empty/loading/error states fit
  without page-level horizontal overflow.
- [ ] New content follows the bottom; scrolling up preserves reading position.
- [ ] Light/dark themes, keyboard focus, zoom, and screen-reader behavior are
  acceptable for your application's accessibility requirements.
- [ ] CSRF rotation, session expiry, 401/403/429/5xx, network loss, and truncated
  streams behave correctly. No enterprise secret appears in browser requests.
- [ ] The actual CSP and any CORS policy work without weakening protections.
- [ ] Required history/feedback/voice adapters enforce access controls.
- [ ] Android real-device checks pass if the page is embedded in an app.

The SDK release was locally checked with unit/contract tests, React layout
tests, and browser tests in Chromium, Firefox, and WebKit, including the ZIP
opened from disk. That does not validate the client's Java deployment, security
policies, native audio, or all future browser versions.
The guide's JavaScript initialization is browser-tested; the JSP template must
still be compiled and adapted in the client's own Java/JSTL/security stack.

## 12. Troubleshooting and Upgrades

| Symptom | First checks |
| --- | --- |
| `CypherXChat is not defined` | Script URL/status/MIME type, CSP, load order, and whether you loaded the classic script rather than the module build |
| Mount target error | Element exists, is connected to the current document, and is not already mounted |
| Empty or clipped widget | Container width/height, hidden ancestors, flex/grid constraints, host clipping/transforms |
| `Expected a text/event-stream response` | Java returned buffered JSON, HTML, a login redirect, or an incorrect content type |
| Entire answer arrives at once | Backend or proxy is buffering; verify flushes and the network response timing |
| Incomplete-response error | Missing terminal event/blank line, network disconnect, proxy timeout, or malformed SSE |
| 401/403 | Session cookies, expired login, CSRF header/token, and server-side authorization |
| Table has no spacing/borders in a custom UI | Missing/stale `markdown.css`, mismatched files, or host CSS overriding the scoped styles |
| Charts are missing | No `ui_block` before `done`, invalid ViewSpec, or unsupported backend/block type |
| Duplicate mount after AJAX navigation | Destroy the previous instance before replacing its target or mounting again |
| History/voice/feedback is absent | Required adapter/configuration or persisted backend message ID is missing |

For support, provide the SDK version, browser/WebView and device versions,
viewport/container dimensions, integration mode, a screenshot, and a minimal
redacted Markdown/SSE example. Include HTTP status/content type and CSP errors.
Remove cookies, tokens, API keys, personal data, and sensitive business data
before sharing logs or network captures.

To upgrade, deploy the new complete ZIP to a **new versioned directory**, verify
checksums, update the JSP's asset path, and repeat the acceptance checks. Keep
the previous directory for rollback. Do not overwrite cached files in place or
mix JS/CSS from different releases. For React consumers, update the npm package
and its matching styles together; do not additionally load the browser SDK into
the same React-owned chat container.
