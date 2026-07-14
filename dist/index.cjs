'use strict';

var react = require('react');
var jsxRuntime = require('react/jsx-runtime');
var react$1 = require('motion/react');
var lucideReact = require('lucide-react');
var clsx = require('clsx');
var tailwindMerge = require('tailwind-merge');
var recharts = require('recharts');

// src/components/chat-provider.tsx
var ChatContext = react.createContext(null);
function useChatContext() {
  const ctx = react.useContext(ChatContext);
  if (!ctx) {
    throw new Error(
      "useChatContext must be used within a <ChatProvider>. Wrap your chat components with <ChatProvider onSend={...}>."
    );
  }
  return ctx;
}

// src/context/chat-reducer.ts
var initialChatState = {
  messages: [],
  isStreaming: false,
  activeSessionId: null,
  sessions: [],
  inputValue: "",
  error: null,
  connectionStatus: "idle"
};
function updateActionInTree(actions, actionId, status, detail) {
  return actions.map((action) => {
    if (action.id === actionId) {
      return { ...action, status, detail: detail ?? action.detail };
    }
    if (action.children && action.children.length > 0) {
      const updatedChildren = updateActionInTree(action.children, actionId, status, detail);
      if (updatedChildren !== action.children) {
        return { ...action, children: updatedChildren };
      }
    }
    return action;
  });
}
function updateMessage(messages, messageId, updater) {
  return messages.map((msg) => msg.id === messageId ? updater(msg) : msg);
}
function chatReducer(state, action) {
  switch (action.type) {
    case "ADD_USER_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.message],
        error: null
      };
    case "ADD_ASSISTANT_PLACEHOLDER":
      return {
        ...state,
        messages: [...state.messages, action.message]
      };
    case "APPEND_TOKEN":
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          content: msg.content + action.text
        }))
      };
    case "APPEND_REASONING":
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          reasoning: (msg.reasoning ?? "") + action.text
        }))
      };
    case "ADD_ACTION":
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          actions: [...msg.actions ?? [], action.action]
        }))
      };
    case "UPDATE_ACTION":
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          actions: msg.actions ? updateActionInTree(msg.actions, action.actionId, action.status, action.detail) : []
        }))
      };
    case "SET_FOLLOWUPS":
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          followups: action.followups
        }))
      };
    case "APPEND_BLOCK":
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          blocks: [...msg.blocks ?? [], action.spec]
        }))
      };
    case "LOCK_FOLLOWUPS":
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          followupsSelection: action.selection
        }))
      };
    case "SET_FEEDBACK":
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          feedback: action.feedback
        }))
      };
    case "FINALIZE_MESSAGE":
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          isStreaming: false,
          // Capture the backend's persisted message id so feedback / regen
          // can target this turn after streaming completes.
          backendMessageId: action.backendMessageId ?? msg.backendMessageId,
          // Auto-complete any running/pending actions when the message finalizes
          actions: msg.actions?.map(
            (a) => a.status === "running" || a.status === "pending" ? { ...a, status: "completed" } : a
          )
        })),
        activeSessionId: action.sessionId ?? state.activeSessionId
      };
    case "TRIM_LAST_PAIR": {
      const msgs = state.messages;
      const last = msgs[msgs.length - 1];
      if (!last) return state;
      let dropCount = 1;
      if (last.role === "assistant" && msgs.length >= 2 && msgs[msgs.length - 2].role === "user") {
        dropCount = 2;
      } else if (last.role === "user" && msgs.length >= 2 && msgs[msgs.length - 2].role === "assistant") {
        dropCount = 1;
      }
      return {
        ...state,
        messages: msgs.slice(0, msgs.length - dropCount)
      };
    }
    case "SET_ERROR":
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          error: true,
          isStreaming: false,
          content: msg.content || action.error
        })),
        error: action.error
      };
    case "SET_MESSAGES":
      return {
        ...state,
        messages: action.messages
      };
    case "SET_STREAMING":
      return {
        ...state,
        isStreaming: action.isStreaming
      };
    case "SET_SESSION":
      return {
        ...state,
        activeSessionId: action.sessionId
      };
    case "SET_SESSIONS":
      return {
        ...state,
        sessions: action.sessions
      };
    case "REMOVE_SESSION": {
      const isActive = state.activeSessionId === action.sessionId;
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.sessionId),
        activeSessionId: isActive ? null : state.activeSessionId,
        messages: isActive ? [] : state.messages
      };
    }
    case "SET_INPUT":
      return {
        ...state,
        inputValue: action.value
      };
    case "SET_CONNECTION_STATUS":
      return {
        ...state,
        connectionStatus: action.status
      };
    case "RESET":
      return {
        ...state,
        messages: [],
        activeSessionId: null,
        isStreaming: false,
        inputValue: "",
        error: null,
        connectionStatus: "idle"
      };
    default:
      return state;
  }
}
var messageCounter = 0;
function generateId() {
  messageCounter += 1;
  return `msg_${Date.now()}_${messageCounter}`;
}
function ChatProvider({
  children,
  onSend,
  sessionAdapter,
  initialMessages,
  initialSessionId = null,
  maxInputLength = 1e4,
  placeholder,
  autoFocus = true,
  actionLabels,
  feedback,
  enableRegenerate = false
}) {
  const [state, dispatch] = react.useReducer(chatReducer, {
    ...initialChatState,
    messages: initialMessages ?? [],
    activeSessionId: initialSessionId
  });
  const generatorRef = react.useRef(null);
  const isStreamingRef = react.useRef(false);
  const config = react.useMemo(
    () => ({
      onSend,
      sessionAdapter,
      initialMessages,
      initialSessionId,
      maxInputLength,
      placeholder,
      autoFocus,
      actionLabels,
      feedback,
      enableRegenerate
    }),
    [onSend, sessionAdapter, initialMessages, initialSessionId, maxInputLength, placeholder, autoFocus, actionLabels, feedback, enableRegenerate]
  );
  const send = react.useCallback(
    (message, metadata) => {
      if (isStreamingRef.current) return;
      const trimmed = message.trim();
      if (!trimmed) return;
      const userMessage = {
        id: generateId(),
        role: "user",
        content: trimmed,
        timestamp: /* @__PURE__ */ new Date(),
        metadata
      };
      const assistantMessage = {
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: /* @__PURE__ */ new Date(),
        isStreaming: true
      };
      dispatch({ type: "ADD_USER_MESSAGE", message: userMessage });
      dispatch({ type: "ADD_ASSISTANT_PLACEHOLDER", message: assistantMessage });
      dispatch({ type: "SET_INPUT", value: "" });
      dispatch({ type: "SET_STREAMING", isStreaming: true });
      dispatch({ type: "SET_CONNECTION_STATUS", status: "connecting" });
      const generator = onSend(trimmed, state.activeSessionId, metadata);
      generatorRef.current = generator;
      isStreamingRef.current = true;
      (async () => {
        try {
          dispatch({ type: "SET_CONNECTION_STATUS", status: "streaming" });
          for await (const event of generator) {
            switch (event.type) {
              case "token":
                dispatch({
                  type: "APPEND_TOKEN",
                  messageId: assistantMessage.id,
                  text: event.text
                });
                break;
              case "thinking":
                break;
              case "reasoning":
                dispatch({
                  type: "APPEND_REASONING",
                  messageId: assistantMessage.id,
                  text: event.text
                });
                break;
              case "action":
                dispatch({
                  type: "ADD_ACTION",
                  messageId: assistantMessage.id,
                  action: event.action
                });
                break;
              case "action_update":
                dispatch({
                  type: "UPDATE_ACTION",
                  messageId: assistantMessage.id,
                  actionId: event.actionId,
                  status: event.status,
                  detail: event.detail
                });
                break;
              case "followups":
                dispatch({
                  type: "SET_FOLLOWUPS",
                  messageId: assistantMessage.id,
                  followups: event.followups
                });
                break;
              case "ui_block":
                dispatch({
                  type: "APPEND_BLOCK",
                  messageId: assistantMessage.id,
                  spec: event.spec
                });
                break;
              case "done":
                dispatch({
                  type: "FINALIZE_MESSAGE",
                  messageId: assistantMessage.id,
                  sessionId: event.sessionId,
                  backendMessageId: event.messageId
                });
                break;
              case "error":
                dispatch({
                  type: "SET_ERROR",
                  messageId: assistantMessage.id,
                  error: event.message
                });
                break;
            }
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Connection lost";
          dispatch({
            type: "SET_ERROR",
            messageId: assistantMessage.id,
            error: errorMessage
          });
        } finally {
          dispatch({ type: "SET_STREAMING", isStreaming: false });
          dispatch({ type: "SET_CONNECTION_STATUS", status: "idle" });
          generatorRef.current = null;
          isStreamingRef.current = false;
        }
      })();
    },
    [onSend, state.activeSessionId]
  );
  const stop = react.useCallback(() => {
    if (generatorRef.current) {
      generatorRef.current.return(void 0);
    }
  }, []);
  const retry = react.useCallback(
    (messageId) => {
      const msgIndex = state.messages.findIndex((m) => m.id === messageId);
      if (msgIndex < 0) return;
      const erroredMessage = state.messages[msgIndex];
      if (erroredMessage.role !== "assistant" || !erroredMessage.error) return;
      const userMessage = state.messages.slice(0, msgIndex).reverse().find((m) => m.role === "user");
      if (!userMessage) return;
      const remainingMessages = state.messages.filter(
        (m) => m.id !== messageId && m.id !== userMessage.id
      );
      dispatch({ type: "SET_MESSAGES", messages: remainingMessages });
      send(userMessage.content, userMessage.metadata);
    },
    [state.messages, send]
  );
  const setInput = react.useCallback((value) => {
    dispatch({ type: "SET_INPUT", value });
  }, []);
  const clearMessages = react.useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);
  const setMessages = react.useCallback((messages) => {
    dispatch({ type: "SET_MESSAGES", messages });
  }, []);
  const loadSession = react.useCallback(
    async (sessionId) => {
      if (!sessionAdapter?.get) return;
      try {
        const { session, messages } = await sessionAdapter.get(sessionId);
        dispatch({ type: "SET_MESSAGES", messages });
        dispatch({ type: "SET_SESSION", sessionId: session.id });
      } catch {
      }
    },
    [sessionAdapter]
  );
  const deleteSession = react.useCallback(
    async (sessionId) => {
      if (!sessionAdapter?.delete) return;
      try {
        await sessionAdapter.delete(sessionId);
        dispatch({ type: "REMOVE_SESSION", sessionId });
        if (sessionId === state.activeSessionId) {
          dispatch({ type: "RESET" });
        }
      } catch {
      }
    },
    [sessionAdapter, state.activeSessionId]
  );
  const newConversation = react.useCallback(() => {
    if (isStreamingRef.current) {
      stop();
    }
    dispatch({ type: "RESET" });
  }, [stop]);
  const refreshSessions = react.useCallback(async () => {
    if (!sessionAdapter?.list) return;
    try {
      const sessions = await sessionAdapter.list();
      dispatch({ type: "SET_SESSIONS", sessions });
    } catch {
    }
  }, [sessionAdapter]);
  const didInitialListRef = react.useRef(false);
  react.useEffect(() => {
    if (sessionAdapter && !didInitialListRef.current) {
      didInitialListRef.current = true;
      void refreshSessions();
    }
  }, [sessionAdapter, refreshSessions]);
  const wasStreamingRef = react.useRef(false);
  react.useEffect(() => {
    if (wasStreamingRef.current && !state.isStreaming) {
      void refreshSessions();
    }
    wasStreamingRef.current = state.isStreaming;
  }, [state.isStreaming, refreshSessions]);
  const selectFollowup = react.useCallback(
    (messageId, options) => {
      if (options.length === 0) return;
      dispatch({ type: "LOCK_FOLLOWUPS", messageId, selection: options });
      const text = options.join(", ");
      send(text);
    },
    [send]
  );
  const submitFeedback = react.useCallback(
    async (messageId, fb) => {
      if (!feedback) return;
      const msg = state.messages.find((m) => m.id === messageId);
      const backendId = msg?.backendMessageId;
      if (!backendId) return;
      const previous = msg?.feedback ?? null;
      dispatch({ type: "SET_FEEDBACK", messageId, feedback: fb });
      try {
        await feedback.submit(backendId, fb);
      } catch (err) {
        dispatch({ type: "SET_FEEDBACK", messageId, feedback: previous });
        throw err;
      }
    },
    [feedback, state.messages]
  );
  const removeFeedback = react.useCallback(
    async (messageId) => {
      if (!feedback) return;
      const msg = state.messages.find((m) => m.id === messageId);
      const backendId = msg?.backendMessageId;
      if (!backendId) return;
      const previous = msg?.feedback ?? null;
      dispatch({ type: "SET_FEEDBACK", messageId, feedback: null });
      try {
        await feedback.remove(backendId);
      } catch (err) {
        dispatch({ type: "SET_FEEDBACK", messageId, feedback: previous });
        throw err;
      }
    },
    [feedback, state.messages]
  );
  const editAndRegenerate = react.useCallback(
    (newContent) => {
      const trimmed = newContent.trim();
      if (!trimmed) return;
      dispatch({ type: "TRIM_LAST_PAIR" });
      send(trimmed, { regenerate: true });
    },
    [send]
  );
  const regenerateLast = react.useCallback(() => {
    const lastUser = [...state.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    dispatch({ type: "TRIM_LAST_PAIR" });
    send(lastUser.content, { regenerate: true });
  }, [state.messages, send]);
  const contextValue = react.useMemo(
    () => ({
      state,
      config,
      send,
      stop,
      retry,
      setInput,
      clearMessages,
      setMessages,
      loadSession,
      deleteSession,
      newConversation,
      refreshSessions,
      selectFollowup,
      submitFeedback,
      removeFeedback,
      editAndRegenerate,
      regenerateLast
    }),
    [
      state,
      config,
      send,
      stop,
      retry,
      setInput,
      clearMessages,
      setMessages,
      loadSession,
      deleteSession,
      newConversation,
      refreshSessions,
      selectFollowup,
      submitFeedback,
      removeFeedback,
      editAndRegenerate,
      regenerateLast
    ]
  );
  return /* @__PURE__ */ jsxRuntime.jsx(ChatContext.Provider, { value: contextValue, children });
}
function cn(...inputs) {
  return tailwindMerge.twMerge(clsx.clsx(inputs));
}
function useChatScroll(deps) {
  const scrollRef = react.useRef(null);
  const bottomRef = react.useRef(null);
  const [isAtBottom, setIsAtBottom] = react.useState(true);
  const [unreadCount, setUnreadCount] = react.useState(0);
  const isAtBottomRef = react.useRef(true);
  const scrollToBottom = react.useCallback((behavior = "smooth") => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior, block: "end" });
    }
    setUnreadCount(0);
    setIsAtBottom(true);
    isAtBottomRef.current = true;
  }, []);
  react.useEffect(() => {
    const sentinel = bottomRef.current;
    const container = scrollRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          const atBottom = entry.isIntersecting;
          isAtBottomRef.current = atBottom;
          setIsAtBottom(atBottom);
          if (atBottom) {
            setUnreadCount(0);
          }
        }
      },
      {
        root: container,
        // Threshold of 0 means "any part of the sentinel is visible"
        threshold: 0,
        // Small margin at the bottom to trigger slightly before the exact bottom
        rootMargin: "0px 0px 100px 0px"
      }
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, []);
  react.useEffect(() => {
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom("smooth");
      });
    } else {
      setUnreadCount((prev) => prev + 1);
    }
  }, deps);
  return {
    scrollRef,
    bottomRef,
    isAtBottom,
    unreadCount,
    scrollToBottom
  };
}

// src/utils/markdown.ts
var ALLOWED_TAGS = /* @__PURE__ */ new Set([
  "p",
  "br",
  "strong",
  "em",
  "del",
  "a",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "div",
  "span"
]);
var ALLOWED_ATTR_MAP = {
  a: /* @__PURE__ */ new Set(["href", "target", "rel", "class"]),
  pre: /* @__PURE__ */ new Set(["class", "data-language"]),
  code: /* @__PURE__ */ new Set(["class", "data-language"]),
  div: /* @__PURE__ */ new Set(["class"]),
  span: /* @__PURE__ */ new Set(["class"]),
  td: /* @__PURE__ */ new Set(["class"]),
  th: /* @__PURE__ */ new Set(["class"])
};
function sanitize(html) {
  let result = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  result = result.replace(/href\s*=\s*["']?\s*javascript\s*:/gi, 'href="');
  result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)?\/?>/g, (match, tagName, attrs) => {
    const tag = tagName.toLowerCase();
    const isClosing = match.startsWith("</");
    if (!ALLOWED_TAGS.has(tag)) {
      return "";
    }
    if (isClosing) {
      return `</${tag}>`;
    }
    const allowedAttrs = ALLOWED_ATTR_MAP[tag];
    if (!attrs || !allowedAttrs) {
      const selfClosing2 = match.endsWith("/>");
      return selfClosing2 ? `<${tag} />` : `<${tag}>`;
    }
    const filteredAttrs = [];
    const attrRegex = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
      if (!allowedAttrs.has(attrName)) continue;
      if (attrName === "href") {
        const trimmed = attrValue.trim().toLowerCase();
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && !trimmed.startsWith("mailto:") && !trimmed.startsWith("#")) {
          continue;
        }
      }
      filteredAttrs.push(`${attrName}="${attrValue}"`);
    }
    const attrStr = filteredAttrs.length > 0 ? " " + filteredAttrs.join(" ") : "";
    const selfClosing = match.endsWith("/>");
    return selfClosing ? `<${tag}${attrStr} />` : `<${tag}${attrStr}>`;
  });
  return result;
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function processInline(text) {
  let result = escapeHtml(text);
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/~~(.+?)~~/g, "<del>$1</del>");
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  result = result.replace(/ {2,}\n/g, "<br />");
  return result;
}
function renderMarkdown(markdown) {
  const lines = markdown.split("\n");
  const output = [];
  let i = 0;
  let inList = null;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      const language = line.trimStart().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      if (inList) {
        output.push(inList === "ul" ? "</ul>" : "</ol>");
        inList = null;
      }
      const code = escapeHtml(codeLines.join("\n"));
      const langAttr = language ? ` data-language="${escapeHtml(language)}"` : "";
      output.push(`<pre${langAttr}><code${langAttr}>${code}</code></pre>`);
      continue;
    }
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      if (inList) {
        output.push(inList === "ul" ? "</ul>" : "</ol>");
        inList = null;
      }
      output.push("<hr />");
      i++;
      continue;
    }
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      if (inList) {
        output.push(inList === "ul" ? "</ul>" : "</ol>");
        inList = null;
      }
      const level = Math.min(headerMatch[1].length + 2, 6);
      output.push(`<h${level}>${processInline(headerMatch[2])}</h${level}>`);
      i++;
      continue;
    }
    if (line.trimStart().startsWith("> ")) {
      if (inList) {
        output.push(inList === "ul" ? "</ul>" : "</ol>");
        inList = null;
      }
      const quoteLines = [];
      while (i < lines.length && lines[i].trimStart().startsWith("> ")) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      output.push(`<blockquote>${processInline(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-| :]*$/.test(lines[i + 1])) {
      if (inList) {
        output.push(inList === "ul" ? "</ul>" : "</ol>");
        inList = null;
      }
      const headerCells = line.split("|").map((c) => c.trim()).filter(Boolean);
      i += 2;
      const tableRows = [];
      while (i < lines.length && lines[i].includes("|")) {
        const cells = lines[i].split("|").map((c) => c.trim()).filter(Boolean);
        tableRows.push(cells);
        i++;
      }
      let tableHtml = '<div class="cxc-table-scroll"><table><thead><tr>';
      for (const cell of headerCells) {
        tableHtml += `<th>${processInline(cell)}</th>`;
      }
      tableHtml += "</tr></thead><tbody>";
      for (const row of tableRows) {
        tableHtml += "<tr>";
        for (let c = 0; c < headerCells.length; c++) {
          tableHtml += `<td>${processInline(row[c] ?? "")}</td>`;
        }
        tableHtml += "</tr>";
      }
      tableHtml += "</tbody></table></div>";
      output.push(tableHtml);
      continue;
    }
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (inList !== "ul") {
        if (inList) output.push("</ol>");
        output.push("<ul>");
        inList = "ul";
      }
      output.push(`<li>${processInline(ulMatch[2])}</li>`);
      i++;
      continue;
    }
    const olMatch = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
    if (olMatch) {
      if (inList !== "ol") {
        if (inList) output.push("</ul>");
        output.push("<ol>");
        inList = "ol";
      }
      output.push(`<li>${processInline(olMatch[2])}</li>`);
      i++;
      continue;
    }
    if (inList && line.trim() === "") {
      output.push(inList === "ul" ? "</ul>" : "</ol>");
      inList = null;
      i++;
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (inList) {
      output.push(inList === "ul" ? "</ul>" : "</ol>");
      inList = null;
    }
    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].trimStart().startsWith("#") && !lines[i].trimStart().startsWith("```") && !lines[i].trimStart().startsWith("> ") && !lines[i].match(/^(\s*)[-*+]\s+/) && !lines[i].match(/^(\s*)\d+[.)]\s+/) && !lines[i].match(/^[-*_]{3,}\s*$/)) {
      paraLines.push(lines[i]);
      i++;
    }
    output.push(`<p>${processInline(paraLines.join("\n"))}</p>`);
  }
  if (inList) {
    output.push(inList === "ul" ? "</ul>" : "</ol>");
  }
  return sanitize(output.join("\n"));
}
function TextShimmer({
  children,
  as,
  duration = 2,
  spread = 20,
  className
}) {
  const Component2 = as ?? "span";
  const style = {
    "--cxc-shimmer-duration": `${duration}s`
  };
  if (spread !== 20) {
    const from = 50 - spread;
    const to = 50 + spread;
    style.background = `linear-gradient(90deg, var(--cxc-shimmer-from) 0%, var(--cxc-shimmer-from) ${from}%, var(--cxc-shimmer-via) 50%, var(--cxc-shimmer-from) ${to}%, var(--cxc-shimmer-from) 100%)`;
    style.backgroundSize = "200% 100%";
    style.WebkitBackgroundClip = "text";
    style.backgroundClip = "text";
    style.WebkitTextFillColor = "transparent";
  }
  return /* @__PURE__ */ jsxRuntime.jsx(
    Component2,
    {
      className: cn("cxc-text-shimmer", className),
      style,
      children
    }
  );
}
function StepIcon({ status }) {
  switch (status) {
    case "completed":
      return /* @__PURE__ */ jsxRuntime.jsx(
        lucideReact.CheckCircle2,
        {
          size: 14,
          style: { color: "var(--cxc-success)" },
          "aria-hidden": "true"
        }
      );
    case "running":
      return /* @__PURE__ */ jsxRuntime.jsx(
        lucideReact.Clock,
        {
          size: 14,
          className: "cxc-thinking-pulse",
          style: { color: "var(--cxc-thinking-color)" },
          "aria-hidden": "true"
        }
      );
    case "error":
      return /* @__PURE__ */ jsxRuntime.jsx(
        lucideReact.AlertCircle,
        {
          size: 14,
          style: { color: "var(--cxc-error)" },
          "aria-hidden": "true"
        }
      );
    default:
      return /* @__PURE__ */ jsxRuntime.jsx(
        lucideReact.Circle,
        {
          size: 14,
          style: { color: "var(--cxc-text-muted)" },
          "aria-hidden": "true"
        }
      );
  }
}
function Step({
  action,
  isLast,
  depth = 0
}) {
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { paddingLeft: depth > 0 ? `${depth * 16}px` : void 0 }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2.5 py-1.5 relative", children: [
      !isLast && /* @__PURE__ */ jsxRuntime.jsx(
        "div",
        {
          className: "absolute left-[6px] top-[20px] bottom-0 w-px",
          style: { backgroundColor: "var(--cxc-action-line)" },
          "aria-hidden": "true"
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsx(
        "div",
        {
          className: "shrink-0 relative z-10 flex items-center justify-center",
          style: { backgroundColor: "var(--cxc-bg)" },
          children: /* @__PURE__ */ jsxRuntime.jsx(StepIcon, { status: action.status })
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "span",
          {
            className: "text-[13px]",
            style: {
              color: action.status === "error" ? "var(--cxc-error)" : action.status === "running" ? "var(--cxc-text)" : "var(--cxc-text-secondary)"
            },
            children: action.label
          }
        ),
        action.detail && /* @__PURE__ */ jsxRuntime.jsx(
          "p",
          {
            className: "mt-0.5 text-xs truncate",
            style: { color: "var(--cxc-text-muted)" },
            title: action.detail,
            children: action.detail
          }
        )
      ] })
    ] }),
    action.children && action.children.length > 0 && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "ml-2", style: { borderLeft: "1px solid var(--cxc-action-line)" }, children: action.children.map((child, i) => /* @__PURE__ */ jsxRuntime.jsx(
      Step,
      {
        action: child,
        isLast: i === action.children.length - 1,
        depth: depth + 1
      },
      child.id
    )) })
  ] });
}
function buildSummary(actions) {
  const counts = /* @__PURE__ */ new Map();
  for (const a of actions) {
    counts.set(a.label, (counts.get(a.label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, n]) => n > 1 ? `${label} (${n}x)` : label).join(", ");
}
function ChainOfThought({
  actions,
  isActive = false,
  thinkingLabel = "Thinking",
  className
}) {
  const [userToggled, setUserToggled] = react.useState(false);
  const [userWantsOpen, setUserWantsOpen] = react.useState(false);
  const contentRef = react.useRef(null);
  const [contentHeight, setContentHeight] = react.useState(0);
  const isExpanded = isActive ? !userToggled || userWantsOpen : userToggled && userWantsOpen;
  react.useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setContentHeight(el.scrollHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  react.useEffect(() => {
    if (!isActive) {
      setUserToggled(false);
      setUserWantsOpen(false);
    }
  }, [isActive]);
  const handleToggle = react.useCallback(() => {
    setUserToggled(true);
    setUserWantsOpen((prev) => !prev);
  }, []);
  if (actions.length === 0) return null;
  const allDone = actions.every((a) => a.status === "completed" || a.status === "error");
  const hasErrors = actions.some((a) => a.status === "error");
  const summary = buildSummary(actions);
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: cn("my-2", className), children: [
    /* @__PURE__ */ jsxRuntime.jsxs(
      "button",
      {
        type: "button",
        onClick: handleToggle,
        className: cn(
          "flex items-center gap-2 w-full min-w-0 py-1.5 text-left",
          "transition-colors duration-150 cursor-pointer",
          "rounded-[var(--cxc-radius-sm)]"
        ),
        "aria-expanded": isExpanded,
        children: [
          isActive ? /* @__PURE__ */ jsxRuntime.jsxs(TextShimmer, { duration: 1.5, className: "text-[13px] font-medium flex-1 min-w-0", children: [
            thinkingLabel,
            "..."
          ] }) : allDone && !hasErrors ? /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-1.5 min-w-0 flex-1", children: [
            /* @__PURE__ */ jsxRuntime.jsx(
              lucideReact.CheckCircle2,
              {
                size: 13,
                className: "shrink-0",
                style: { color: "var(--cxc-success)" },
                "aria-hidden": "true"
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsx(
              "span",
              {
                className: "text-[13px] truncate",
                style: { color: "var(--cxc-text-muted)" },
                children: summary
              }
            )
          ] }) : hasErrors ? /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-1.5 min-w-0 flex-1", children: [
            /* @__PURE__ */ jsxRuntime.jsx(
              lucideReact.AlertCircle,
              {
                size: 13,
                className: "shrink-0",
                style: { color: "var(--cxc-error)" },
                "aria-hidden": "true"
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsx(
              "span",
              {
                className: "text-[13px] truncate",
                style: { color: "var(--cxc-text-muted)" },
                children: summary
              }
            )
          ] }) : /* @__PURE__ */ jsxRuntime.jsx(
            "span",
            {
              className: "text-[13px] truncate flex-1 min-w-0",
              style: { color: "var(--cxc-text-muted)" },
              children: summary
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsx(
            lucideReact.ChevronDown,
            {
              size: 13,
              className: "shrink-0 transition-transform duration-300",
              style: {
                color: "var(--cxc-text-muted)",
                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                transitionTimingFunction: "var(--cxc-ease-accordion)"
              },
              "aria-hidden": "true"
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(
      "div",
      {
        className: "overflow-hidden transition-all duration-300",
        style: {
          maxHeight: isExpanded ? `${contentHeight}px` : "0px",
          opacity: isExpanded ? 1 : 0,
          transitionTimingFunction: "var(--cxc-ease-accordion)"
        },
        children: /* @__PURE__ */ jsxRuntime.jsxs("div", { ref: contentRef, className: "pl-1 pb-1 pt-1", role: "list", "aria-label": "Action steps", children: [
          actions.map((action, i) => /* @__PURE__ */ jsxRuntime.jsx(
            Step,
            {
              action,
              isLast: i === actions.length - 1
            },
            action.id
          )),
          allDone && !hasErrors && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2 pt-1.5 pl-0.5", children: [
            /* @__PURE__ */ jsxRuntime.jsx(
              lucideReact.CheckCircle2,
              {
                size: 12,
                style: { color: "var(--cxc-success)" },
                "aria-hidden": "true"
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsx(
              "span",
              {
                className: "text-xs font-medium",
                style: { color: "var(--cxc-success)" },
                children: "Done"
              }
            )
          ] })
        ] })
      }
    )
  ] });
}
function ThinkingIndicator({
  label = "Thinking",
  className
}) {
  return /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { children: /* @__PURE__ */ jsxRuntime.jsx(
    react$1.motion.div,
    {
      role: "status",
      "aria-label": "AI is thinking",
      initial: { opacity: 0, y: 4 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -4 },
      transition: { duration: 0.2, ease: "easeOut" },
      className: cn("py-2", className),
      children: /* @__PURE__ */ jsxRuntime.jsxs(TextShimmer, { duration: 1.5, className: "text-[13px] font-medium", children: [
        label,
        "..."
      ] })
    }
  ) });
}
function MessageActionBar({
  content,
  actions,
  onCopy,
  onRetry,
  onEdit,
  feedback,
  onFeedback,
  className
}) {
  const [copied, setCopied] = react.useState(false);
  const handleCopy = react.useCallback(async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2e3);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2e3);
    }
  }, [content, onCopy]);
  const defaultActions = [];
  if (content) {
    defaultActions.push({
      id: "copy",
      icon: copied ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Check, { size: 14 }) : /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Copy, { size: 14 }),
      label: copied ? "Copied" : "Copy",
      onClick: handleCopy
    });
  }
  if (onRetry) {
    defaultActions.push({
      id: "retry",
      icon: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.RotateCcw, { size: 14 }),
      label: "Retry",
      onClick: onRetry
    });
  }
  if (onEdit) {
    defaultActions.push({
      id: "edit",
      icon: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Pencil, { size: 14 }),
      label: "Edit",
      onClick: onEdit
    });
  }
  const allActions = [...defaultActions, ...actions ?? []];
  const showFeedback = Boolean(onFeedback);
  const currentRating = feedback?.rating ?? null;
  const handleUp = react.useCallback(() => {
    if (!onFeedback) return;
    onFeedback("up");
  }, [onFeedback]);
  const handleDown = react.useCallback(() => {
    if (!onFeedback) return;
    onFeedback("down");
  }, [onFeedback]);
  if (allActions.length === 0 && !showFeedback) return null;
  return /* @__PURE__ */ jsxRuntime.jsx("div", { className: "relative", children: /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      className: cn(
        "flex items-center gap-0.5",
        "opacity-0 transition-opacity duration-150",
        "group-hover/message:opacity-100",
        "focus-within:opacity-100",
        className
      ),
      role: "toolbar",
      "aria-label": "Message actions",
      children: [
        allActions.map((action) => /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            type: "button",
            onClick: action.onClick,
            className: cn(
              "flex h-7 w-7 items-center justify-center",
              "rounded-[var(--cxc-radius-sm)]",
              "transition-colors duration-100",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-[var(--cxc-border-focus)]"
            ),
            style: { color: "var(--cxc-text-muted)" },
            onMouseOver: (e) => {
              e.currentTarget.style.backgroundColor = "var(--cxc-bg-muted)";
              e.currentTarget.style.color = "var(--cxc-text-secondary)";
            },
            onMouseOut: (e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--cxc-text-muted)";
            },
            "aria-label": action.label,
            title: action.label,
            children: action.icon
          },
          action.id
        )),
        showFeedback && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
          /* @__PURE__ */ jsxRuntime.jsx(
            "button",
            {
              type: "button",
              onClick: handleUp,
              className: cn(
                "flex h-7 w-7 items-center justify-center",
                "rounded-[var(--cxc-radius-sm)]",
                "transition-colors duration-100",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-[var(--cxc-border-focus)]"
              ),
              style: {
                color: currentRating === "up" ? "var(--cxc-text)" : "var(--cxc-text-muted)"
              },
              onMouseOver: (e) => {
                if (currentRating !== "up") {
                  e.currentTarget.style.backgroundColor = "var(--cxc-bg-muted)";
                  e.currentTarget.style.color = "var(--cxc-text-secondary)";
                }
              },
              onMouseOut: (e) => {
                if (currentRating !== "up") {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--cxc-text-muted)";
                }
              },
              "aria-label": currentRating === "up" ? "Liked" : "Like",
              "aria-pressed": currentRating === "up",
              title: currentRating === "up" ? "Liked" : "Like",
              children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ThumbsUp, { size: 14, fill: currentRating === "up" ? "currentColor" : "none" })
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsx(
            "button",
            {
              type: "button",
              onClick: handleDown,
              className: cn(
                "flex h-7 w-7 items-center justify-center",
                "rounded-[var(--cxc-radius-sm)]",
                "transition-colors duration-100",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-[var(--cxc-border-focus)]"
              ),
              style: {
                color: currentRating === "down" ? "var(--cxc-text)" : "var(--cxc-text-muted)"
              },
              onMouseOver: (e) => {
                if (currentRating !== "down") {
                  e.currentTarget.style.backgroundColor = "var(--cxc-bg-muted)";
                  e.currentTarget.style.color = "var(--cxc-text-secondary)";
                }
              },
              onMouseOut: (e) => {
                if (currentRating !== "down") {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--cxc-text-muted)";
                }
              },
              "aria-label": currentRating === "down" ? "Disliked" : "Dislike",
              "aria-pressed": currentRating === "down",
              title: currentRating === "down" ? "Disliked" : "Dislike",
              children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ThumbsDown, { size: 14, fill: currentRating === "down" ? "currentColor" : "none" })
            }
          )
        ] })
      ]
    }
  ) });
}
var OTHER_LABEL = "Other (specify)";
function FollowupsCard({
  followups,
  lockedSelection,
  onSelect,
  className
}) {
  const isLocked = Array.isArray(lockedSelection);
  const [checked, setChecked] = react.useState(/* @__PURE__ */ new Set());
  const [otherActive, setOtherActive] = react.useState(false);
  const [otherText, setOtherText] = react.useState("");
  const otherInputRef = react.useRef(null);
  react.useEffect(() => {
    if (otherActive && otherInputRef.current) {
      otherInputRef.current.focus();
    }
  }, [otherActive]);
  const lockedSet = react.useMemo(
    () => new Set(lockedSelection ?? []),
    [lockedSelection]
  );
  const submitSingle = react.useCallback(
    (option) => {
      if (isLocked) return;
      if (option === OTHER_LABEL) {
        setOtherActive(true);
        return;
      }
      onSelect([option]);
    },
    [isLocked, onSelect]
  );
  const toggleMulti = react.useCallback(
    (option) => {
      if (isLocked) return;
      if (option === OTHER_LABEL) {
        setOtherActive((prev) => !prev);
        return;
      }
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(option)) next.delete(option);
        else next.add(option);
        return next;
      });
    },
    [isLocked]
  );
  const submitMulti = react.useCallback(() => {
    if (isLocked) return;
    const picks = [];
    for (const opt of followups.options) {
      if (opt === OTHER_LABEL) continue;
      if (checked.has(opt)) picks.push(opt);
    }
    if (otherActive && otherText.trim()) {
      picks.push(otherText.trim());
    }
    if (picks.length === 0) return;
    onSelect(picks);
  }, [isLocked, followups.options, checked, otherActive, otherText, onSelect]);
  const submitOther = react.useCallback(() => {
    if (isLocked) return;
    const t = otherText.trim();
    if (!t) return;
    onSelect([t]);
  }, [isLocked, otherText, onSelect]);
  const hasMultiSelection = checked.size > 0 || otherActive && otherText.trim().length > 0;
  return /* @__PURE__ */ jsxRuntime.jsxs(
    react$1.motion.div,
    {
      role: "group",
      "aria-label": followups.label,
      initial: { opacity: 0, y: 4 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] },
      className: cn(
        "mt-3 rounded-[var(--cxc-radius-lg)] px-3.5 py-3",
        className
      ),
      style: {
        backgroundColor: "var(--cxc-bg-subtle)",
        border: "1px solid var(--cxc-border-subtle)"
      },
      children: [
        /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "mb-2.5 flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsxRuntime.jsx(
            "p",
            {
              className: "text-[12px] font-medium tracking-wide uppercase",
              style: { color: "var(--cxc-text-muted)" },
              children: followups.label
            }
          ),
          isLocked && /* @__PURE__ */ jsxRuntime.jsxs(
            "span",
            {
              className: "inline-flex items-center gap-1 text-[11px] font-medium leading-none",
              style: { color: "var(--cxc-text-muted)" },
              children: [
                /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Lock, { size: 11, strokeWidth: 2.2, className: "shrink-0 -mt-px" }),
                /* @__PURE__ */ jsxRuntime.jsx("span", { className: "leading-none", children: lockedSelection && lockedSelection.length > 0 ? "Selected" : "Closed" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex flex-wrap gap-1.5", children: followups.options.map((opt) => {
          const isOther = opt === OTHER_LABEL;
          const isChecked = followups.multi && checked.has(opt);
          const isLockedPick = lockedSet.has(opt);
          isLocked && !lockedSet.has(opt) && isOther === false && // If the locked selection has an item that isn't in options, that
          // was an Other-typed value — we render the OTHER_LABEL pill as
          // un-picked and surface the typed value as a separate locked pill below.
          false;
          return /* @__PURE__ */ jsxRuntime.jsxs(
            "button",
            {
              type: "button",
              disabled: isLocked,
              onClick: () => followups.multi ? toggleMulti(opt) : submitSingle(opt),
              className: cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px]",
                "transition-colors duration-100 outline-none",
                "focus-visible:ring-2 focus-visible:ring-[var(--cxc-border-focus)]",
                isLocked && "cursor-default"
              ),
              style: {
                backgroundColor: isLockedPick ? "var(--cxc-accent-subtle, var(--cxc-bg-muted))" : isChecked ? "var(--cxc-bg-muted)" : "var(--cxc-bg)",
                color: isLockedPick ? "var(--cxc-text)" : "var(--cxc-text-secondary)",
                border: `1px solid ${isLockedPick ? "var(--cxc-border)" : isChecked ? "var(--cxc-border)" : "var(--cxc-border-subtle)"}`,
                opacity: isLocked && !isLockedPick && true ? 0.5 : 1
              },
              onMouseOver: (e) => {
                if (isLocked) return;
                e.currentTarget.style.backgroundColor = "var(--cxc-bg-muted)";
                e.currentTarget.style.color = "var(--cxc-text)";
              },
              onMouseOut: (e) => {
                if (isLocked) return;
                e.currentTarget.style.backgroundColor = isChecked ? "var(--cxc-bg-muted)" : "var(--cxc-bg)";
                e.currentTarget.style.color = "var(--cxc-text-secondary)";
              },
              children: [
                followups.multi && !isOther && /* @__PURE__ */ jsxRuntime.jsx(
                  "span",
                  {
                    "aria-hidden": true,
                    className: "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px]",
                    style: {
                      border: `1px solid ${isChecked ? "var(--cxc-text)" : "var(--cxc-border)"}`,
                      backgroundColor: isChecked ? "var(--cxc-text)" : "transparent"
                    },
                    children: isChecked && /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Check, { size: 9, strokeWidth: 3, style: { color: "var(--cxc-bg)" } })
                  }
                ),
                /* @__PURE__ */ jsxRuntime.jsx("span", { children: opt })
              ]
            },
            opt
          );
        }) }),
        isLocked && lockedSelection && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "mt-2 flex flex-wrap gap-1.5", children: lockedSelection.filter((s) => !followups.options.includes(s)).map((s) => /* @__PURE__ */ jsxRuntime.jsx(
          "span",
          {
            className: "inline-flex items-center rounded-full px-3 py-1.5 text-[13px]",
            style: {
              backgroundColor: "var(--cxc-bg-muted)",
              color: "var(--cxc-text)",
              border: "1px solid var(--cxc-border)"
            },
            children: s
          },
          s
        )) }),
        !isLocked && otherActive && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "mt-2.5 flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntime.jsx(
            "input",
            {
              ref: otherInputRef,
              type: "text",
              value: otherText,
              onChange: (e) => setOtherText(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (followups.multi) submitMulti();
                  else submitOther();
                }
                if (e.key === "Escape") {
                  setOtherActive(false);
                  setOtherText("");
                }
              },
              placeholder: "Type your own\u2026",
              className: cn(
                "flex-1 rounded-[var(--cxc-radius-md)] px-3 py-1.5 text-[13px]",
                "outline-none focus-visible:ring-2 focus-visible:ring-[var(--cxc-border-focus)]"
              ),
              style: {
                backgroundColor: "var(--cxc-bg)",
                color: "var(--cxc-text)",
                border: "1px solid var(--cxc-border)"
              }
            }
          ),
          !followups.multi && /* @__PURE__ */ jsxRuntime.jsx(
            "button",
            {
              type: "button",
              onClick: submitOther,
              disabled: !otherText.trim(),
              className: cn(
                "rounded-full px-3 py-1.5 text-[13px] font-medium",
                "transition-opacity duration-100",
                otherText.trim() ? "opacity-100" : "opacity-40 cursor-not-allowed"
              ),
              style: {
                backgroundColor: "var(--cxc-text)",
                color: "var(--cxc-bg)"
              },
              children: "Send"
            }
          )
        ] }),
        !isLocked && followups.multi && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "mt-3 flex justify-end", children: /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            type: "button",
            onClick: submitMulti,
            disabled: !hasMultiSelection,
            className: cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-medium",
              "transition-opacity duration-100",
              hasMultiSelection ? "opacity-100" : "opacity-40 cursor-not-allowed"
            ),
            style: {
              backgroundColor: "var(--cxc-text)",
              color: "var(--cxc-bg)"
            },
            children: "Continue"
          }
        ) })
      ]
    }
  );
}
var DOWN_REASONS = [
  { value: "incorrect", label: "Incorrect" },
  { value: "hallucinated", label: "Made up" },
  { value: "unhelpful", label: "Not helpful" },
  { value: "too_verbose", label: "Too long" },
  { value: "too_brief", label: "Too short" },
  { value: "unsafe", label: "Unsafe" },
  { value: "off_topic", label: "Off-topic" },
  { value: "other", label: "Other" }
];
function FeedbackPopover({
  rating: _rating,
  onSubmit,
  onDismiss,
  className
}) {
  const [category, setCategory] = react.useState(void 0);
  const [text, setText] = react.useState("");
  const textareaRef = react.useRef(null);
  const containerRef = react.useRef(null);
  react.useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  react.useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onDismiss();
      }
    };
    const t = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [onDismiss]);
  const handleSubmit = () => {
    onSubmit({
      category,
      text: text.trim() || void 0
    });
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(
    react$1.motion.div,
    {
      ref: containerRef,
      role: "dialog",
      "aria-label": "Provide feedback",
      initial: { opacity: 0, y: 4, scale: 0.98 },
      animate: { opacity: 1, y: 0, scale: 1 },
      transition: { duration: 0.14, ease: [0.25, 0.1, 0.25, 1] },
      className: cn(
        "absolute z-50 w-[300px] rounded-[var(--cxc-radius-lg)] p-3.5 shadow-lg",
        className
      ),
      style: {
        backgroundColor: "var(--cxc-bg)",
        border: "1px solid var(--cxc-border)"
      },
      onKeyDown: (e) => {
        if (e.key === "Escape") onDismiss();
      },
      children: [
        /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "mb-2 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntime.jsx("p", { className: "text-[13px] font-medium", style: { color: "var(--cxc-text)" }, children: "What was wrong?" }),
          /* @__PURE__ */ jsxRuntime.jsx(
            "button",
            {
              type: "button",
              onClick: onDismiss,
              className: "flex h-6 w-6 items-center justify-center rounded-[var(--cxc-radius-sm)]",
              style: { color: "var(--cxc-text-muted)" },
              onMouseOver: (e) => {
                e.currentTarget.style.backgroundColor = "var(--cxc-bg-muted)";
              },
              onMouseOut: (e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              },
              "aria-label": "Dismiss",
              children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.X, { size: 14 })
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntime.jsx("div", { className: "mb-2.5 flex flex-wrap gap-1", children: DOWN_REASONS.map((r) => {
          const active = category === r.value;
          return /* @__PURE__ */ jsxRuntime.jsx(
            "button",
            {
              type: "button",
              onClick: () => setCategory(active ? void 0 : r.value),
              className: cn(
                "rounded-full px-2.5 py-1 text-[12px] transition-colors duration-100",
                "outline-none focus-visible:ring-2 focus-visible:ring-[var(--cxc-border-focus)]"
              ),
              style: {
                backgroundColor: active ? "var(--cxc-text)" : "var(--cxc-bg)",
                color: active ? "var(--cxc-bg)" : "var(--cxc-text-secondary)",
                border: `1px solid ${active ? "var(--cxc-text)" : "var(--cxc-border-subtle)"}`
              },
              children: r.label
            },
            r.value
          );
        }) }),
        /* @__PURE__ */ jsxRuntime.jsx(
          "textarea",
          {
            ref: textareaRef,
            value: text,
            onChange: (e) => setText(e.target.value),
            maxLength: 2e3,
            placeholder: "Anything you'd like to add? (optional)",
            rows: 2,
            className: cn(
              "w-full resize-none rounded-[var(--cxc-radius-md)] px-2.5 py-2 text-[13px]",
              "outline-none focus-visible:ring-2 focus-visible:ring-[var(--cxc-border-focus)]"
            ),
            style: {
              backgroundColor: "var(--cxc-bg-subtle)",
              color: "var(--cxc-text)",
              border: "1px solid var(--cxc-border-subtle)"
            }
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "mt-2.5 flex justify-end gap-1.5", children: [
          /* @__PURE__ */ jsxRuntime.jsx(
            "button",
            {
              type: "button",
              onClick: onDismiss,
              className: "rounded-full px-3 py-1 text-[12px]",
              style: {
                color: "var(--cxc-text-secondary)"
              },
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsx(
            "button",
            {
              type: "button",
              onClick: handleSubmit,
              className: "rounded-full px-3 py-1 text-[12px] font-medium",
              style: {
                backgroundColor: "var(--cxc-text)",
                color: "var(--cxc-bg)"
              },
              children: "Submit"
            }
          )
        ] })
      ]
    }
  );
}

// src/aui/aui-types.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isFieldRef(value) {
  return isRecord(value) && typeof value.key === "string" && typeof value.label === "string";
}
function hasMetricGroupShape(block) {
  return Array.isArray(block.metrics);
}
function hasChartShape(block) {
  return typeof block.chart_type === "string" && Array.isArray(block.data) && isFieldRef(block.x) && Array.isArray(block.series) && block.series.every(isFieldRef);
}
function hasTableShape(block) {
  return Array.isArray(block.columns) && Array.isArray(block.rows);
}
function hasTextShape(block) {
  return typeof block.markdown === "string";
}
function hasActionsShape(block) {
  return Array.isArray(block.actions);
}
function isValidBlock(value) {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "metric_group":
      return hasMetricGroupShape(value);
    case "chart":
      return hasChartShape(value);
    case "table":
      return hasTableShape(value);
    case "text":
      return hasTextShape(value);
    case "actions":
      return hasActionsShape(value);
    default:
      return false;
  }
}
function isValidViewSpec(value) {
  return isRecord(value) && Array.isArray(value.blocks);
}
var paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6"
};
function Card({ padding = "md", className, style, children, ...props }) {
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      className: cn("rounded-lg border", paddingClasses[padding], className),
      style: {
        borderColor: "var(--cx-border)",
        backgroundColor: "var(--cx-canvas)",
        boxShadow: "var(--cxc-shadow-sm)",
        ...style
      },
      ...props,
      children
    }
  );
}

// src/aui/chart-theme.ts
var CHART_X_AXIS = {
  tickLine: false,
  axisLine: false,
  tickMargin: 10,
  fontSize: 12,
  fontFamily: "inherit",
  stroke: "var(--cx-text-muted)"
};
var CHART_Y_AXIS = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  fontSize: 12,
  fontFamily: "inherit",
  stroke: "var(--cx-text-muted)"
};
var CHART_GRID_STYLE = {
  vertical: false,
  stroke: "var(--cx-border-subtle)",
  strokeDasharray: "3 3",
  strokeOpacity: 0.6
};
var CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--cx-canvas)",
  border: "1px solid var(--cx-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--cx-text-primary)",
  // Theme-aware depth (flips for light/dark) instead of a fixed light-mode rgba.
  boxShadow: "var(--cxc-shadow-md)"
};
var CHART_ANIMATION = {
  duration: 800,
  easing: "ease-out"
};
var CHART_INITIAL_DIMENSION = {
  width: 320,
  height: 256
};
var SPARKLINE_INITIAL_DIMENSION = {
  width: 80,
  height: 28
};
var CHART_LEGEND_STYLE = {
  fontSize: 12,
  color: "var(--cx-text-secondary)"
};

// src/aui/chart-colors.ts
var CHART_FALLBACKS = [
  "#E76E50",
  // 1 — warm coral / terracotta
  "#2A9D8F",
  // 2 — teal
  "#E9C46A",
  // 3 — soft gold
  "#264653",
  // 4 — dark teal
  "#F4A261",
  // 5 — sandy orange
  "#7C3AED",
  // 6 — violet
  "#059669",
  // 7 — emerald
  "#E11D48"
  // 8 — rose
];
var CHART_COLOR_COUNT = CHART_FALLBACKS.length;
function getChartColor(index) {
  const slot = (index % CHART_COLOR_COUNT + CHART_COLOR_COUNT) % CHART_COLOR_COUNT;
  return `var(--cxc-chart-${slot + 1}, ${CHART_FALLBACKS[slot]})`;
}

// src/aui/format.ts
var COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
var PLAIN = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
var CURRENCY = new Intl.NumberFormat("en-US", {
  style: "decimal",
  useGrouping: true,
  maximumFractionDigits: 2
});
function formatValue(value, format) {
  if (value === null || value === void 0) return "--";
  if (format && format !== "raw") {
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(num)) {
      switch (format) {
        case "currency":
          return CURRENCY.format(num);
        case "percent":
          return `${PLAIN.format(num)}%`;
        case "compact":
          return COMPACT.format(num);
        case "number":
          return PLAIN.format(num);
      }
    }
  }
  return String(value);
}
function formatWithUnit(value, format, unit) {
  const formatted = formatValue(value, format);
  if (!unit || formatted === "--") return formatted;
  return `${formatted} ${unit}`;
}
function isNumeric(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string" && value.trim() !== "") return Number.isFinite(Number(value));
  return false;
}
function MetricGroupBlock({ block }) {
  if (block.metrics.length === 0) return null;
  return /* @__PURE__ */ jsxRuntime.jsx("div", { className: "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", children: block.metrics.map((metric, index) => (
    // Composite key: agent-supplied ids may collide, so pair with the index
    // (matches the pattern in aui-view.tsx / table-block.tsx).
    /* @__PURE__ */ jsxRuntime.jsx(MetricCard, { metric }, `${metric.id ?? "m"}-${index}`)
  )) });
}
function MetricCard({ metric }) {
  const value = formatValue(metric.value, metric.format);
  return /* @__PURE__ */ jsxRuntime.jsxs(Card, { padding: "sm", className: "flex flex-col gap-2", children: [
    /* @__PURE__ */ jsxRuntime.jsx("p", { className: "text-xs font-medium", style: { color: "var(--cx-text-secondary)" }, children: metric.label }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-baseline gap-1.5", children: [
      /* @__PURE__ */ jsxRuntime.jsx(
        "span",
        {
          className: "text-2xl font-semibold tracking-tight",
          style: { color: "var(--cx-text-primary)" },
          children: value
        }
      ),
      metric.unit && /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-xs", style: { color: "var(--cx-text-muted)" }, children: metric.unit })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
      metric.delta ? /* @__PURE__ */ jsxRuntime.jsx(DeltaPill, { delta: metric.delta }) : /* @__PURE__ */ jsxRuntime.jsx("span", {}),
      metric.spark && metric.spark.length > 1 && /* @__PURE__ */ jsxRuntime.jsx(Sparkline, { values: metric.spark })
    ] })
  ] });
}
var DELTA_COLOR = {
  up: "var(--cx-success)",
  down: "var(--cx-error)",
  flat: "var(--cx-text-muted)"
};
var DELTA_GLYPH = {
  up: "\u25B2",
  down: "\u25BC",
  flat: "\u2014"
};
function DeltaPill({ delta }) {
  const color = DELTA_COLOR[delta.direction];
  return /* @__PURE__ */ jsxRuntime.jsxs("span", { className: "inline-flex items-center gap-1 text-xs font-medium", style: { color }, children: [
    /* @__PURE__ */ jsxRuntime.jsx("span", { "aria-hidden": "true", children: DELTA_GLYPH[delta.direction] }),
    /* @__PURE__ */ jsxRuntime.jsx("span", { children: formatValue(delta.value) }),
    delta.label && /* @__PURE__ */ jsxRuntime.jsx("span", { className: "font-normal", style: { color: "var(--cx-text-muted)" }, children: delta.label })
  ] });
}
function Sparkline({ values }) {
  const data = values.map((value, index) => ({ index, value }));
  return /* @__PURE__ */ jsxRuntime.jsx("div", { className: "h-7 w-20", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntime.jsx(
    recharts.ResponsiveContainer,
    {
      width: "100%",
      height: "100%",
      initialDimension: SPARKLINE_INITIAL_DIMENSION,
      children: /* @__PURE__ */ jsxRuntime.jsx(recharts.LineChart, { data, margin: { top: 2, right: 2, bottom: 2, left: 2 }, children: /* @__PURE__ */ jsxRuntime.jsx(
        recharts.Line,
        {
          type: "monotone",
          dataKey: "value",
          stroke: getChartColor(0),
          strokeWidth: 1.5,
          dot: false,
          isAnimationActive: true,
          animationDuration: CHART_ANIMATION.duration,
          animationEasing: CHART_ANIMATION.easing
        }
      ) })
    }
  ) });
}
var FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
function Dialog({ open, onClose, title, children }) {
  const overlayRef = react.useRef(null);
  const panelRef = react.useRef(null);
  const previouslyFocused = react.useRef(null);
  const focusableElements = react.useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return [];
    return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR));
  }, []);
  const handleKeyDown = react.useCallback(
    (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = focusableElements();
      if (focusables.length === 0) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panelRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose, focusableElements]
  );
  react.useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);
  react.useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    const focusables = focusableElements();
    (focusables[0] ?? panelRef.current)?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open, focusableElements]);
  if (!open) return null;
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      ref: overlayRef,
      className: "fixed inset-0 z-50 flex items-center justify-center p-4",
      style: { backgroundColor: "var(--cxc-bg-overlay)" },
      onClick: (e) => {
        if (e.target === overlayRef.current) onClose();
      },
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title,
      children: /* @__PURE__ */ jsxRuntime.jsxs(
        "div",
        {
          ref: panelRef,
          tabIndex: -1,
          className: "w-full max-w-3xl rounded-lg border focus:outline-none",
          style: {
            borderColor: "var(--cx-border)",
            backgroundColor: "var(--cx-canvas)",
            boxShadow: "var(--cxc-shadow-lg)"
          },
          children: [
            /* @__PURE__ */ jsxRuntime.jsxs(
              "div",
              {
                className: "flex items-center justify-between border-b px-5 py-4",
                style: { borderColor: "var(--cx-border)" },
                children: [
                  /* @__PURE__ */ jsxRuntime.jsx("h2", { className: "text-base font-semibold", style: { color: "var(--cx-text-primary)" }, children: title }),
                  /* @__PURE__ */ jsxRuntime.jsx(
                    "button",
                    {
                      onClick: onClose,
                      className: "rounded-md p-1 transition-colors focus:outline-none focus-visible:ring-2",
                      style: { color: "var(--cx-text-muted)" },
                      "aria-label": "Close dialog",
                      children: /* @__PURE__ */ jsxRuntime.jsxs(
                        "svg",
                        {
                          xmlns: "http://www.w3.org/2000/svg",
                          width: "18",
                          height: "18",
                          viewBox: "0 0 24 24",
                          fill: "none",
                          stroke: "currentColor",
                          strokeWidth: "2",
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                          "aria-hidden": "true",
                          children: [
                            /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
                            /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
                          ]
                        }
                      )
                    }
                  )
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsx("div", { className: "px-5 py-4", children })
          ]
        }
      )
    }
  );
}
function DownloadIcon() {
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsxRuntime.jsx("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
        /* @__PURE__ */ jsxRuntime.jsx("polyline", { points: "7 10 12 15 17 10" }),
        /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "12", y1: "15", x2: "12", y2: "3" })
      ]
    }
  );
}

// src/aui/charts/chart-helpers.ts
function chartLegendProps() {
  return {
    wrapperStyle: {
      fontSize: CHART_LEGEND_STYLE.fontSize,
      color: CHART_LEGEND_STYLE.color
    }
  };
}
function shortenLabel(value) {
  const str = String(value ?? "");
  return str.length > 12 ? `${str.slice(0, 10)}...` : str;
}
function shouldShowLegend(seriesCount, showLegend) {
  return showLegend ?? seriesCount > 1;
}
function ChartEmpty({ label = "No data" }) {
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      className: "flex h-full items-center justify-center text-sm",
      style: { color: "var(--cx-text-muted)" },
      role: "status",
      "aria-label": "No chart data available",
      children: label
    }
  );
}
function BarChart({ data, x, series, options }) {
  if (!data.length || !x.key || series.length === 0) {
    return /* @__PURE__ */ jsxRuntime.jsx(ChartEmpty, {});
  }
  const isVertical = options?.orientation === "vertical";
  const showLegend = shouldShowLegend(series.length, options?.showLegend);
  const seriesLabels = series.map((s) => s.label).join(", ");
  return /* @__PURE__ */ jsxRuntime.jsx(recharts.ResponsiveContainer, { width: "100%", height: "100%", initialDimension: CHART_INITIAL_DIMENSION, children: /* @__PURE__ */ jsxRuntime.jsxs(
    recharts.BarChart,
    {
      data,
      layout: isVertical ? "vertical" : "horizontal",
      accessibilityLayer: true,
      "aria-label": `Bar chart of ${seriesLabels} by ${x.label}`,
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(recharts.CartesianGrid, { ...CHART_GRID_STYLE }),
        isVertical ? /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
          /* @__PURE__ */ jsxRuntime.jsx(recharts.XAxis, { ...CHART_X_AXIS, type: "number" }),
          /* @__PURE__ */ jsxRuntime.jsx(
            recharts.YAxis,
            {
              ...CHART_Y_AXIS,
              dataKey: x.key,
              type: "category",
              width: 100,
              tickFormatter: shortenLabel
            }
          )
        ] }) : /* @__PURE__ */ jsxRuntime.jsx(recharts.XAxis, { ...CHART_X_AXIS, dataKey: x.key, tickFormatter: shortenLabel }),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.Tooltip, { cursor: false, contentStyle: CHART_TOOLTIP_STYLE }),
        showLegend && /* @__PURE__ */ jsxRuntime.jsx(recharts.Legend, { ...chartLegendProps() }),
        series.map((s, index) => /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Bar,
          {
            dataKey: s.key,
            name: s.label,
            fill: getChartColor(index),
            radius: 4,
            stackId: options?.stacked ? "stack" : void 0,
            isAnimationActive: true,
            animationDuration: CHART_ANIMATION.duration,
            animationEasing: CHART_ANIMATION.easing
          },
          s.key
        ))
      ]
    }
  ) });
}
function LineChart2({ data, x, series, options }) {
  if (!data.length || !x.key || series.length === 0) {
    return /* @__PURE__ */ jsxRuntime.jsx(ChartEmpty, {});
  }
  const showLegend = shouldShowLegend(series.length, options?.showLegend);
  const seriesLabels = series.map((s) => s.label).join(", ");
  return /* @__PURE__ */ jsxRuntime.jsx(recharts.ResponsiveContainer, { width: "100%", height: "100%", initialDimension: CHART_INITIAL_DIMENSION, children: /* @__PURE__ */ jsxRuntime.jsxs(
    recharts.LineChart,
    {
      data,
      accessibilityLayer: true,
      "aria-label": `Line chart of ${seriesLabels} by ${x.label}`,
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(recharts.CartesianGrid, { ...CHART_GRID_STYLE }),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.XAxis, { ...CHART_X_AXIS, dataKey: x.key, tickFormatter: shortenLabel }),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.Tooltip, { cursor: false, contentStyle: CHART_TOOLTIP_STYLE }),
        showLegend && /* @__PURE__ */ jsxRuntime.jsx(recharts.Legend, { ...chartLegendProps() }),
        series.map((s, index) => /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Line,
          {
            dataKey: s.key,
            name: s.label,
            type: "monotone",
            stroke: getChartColor(index),
            strokeWidth: 2,
            dot: false,
            activeDot: { r: 4, strokeWidth: 0 },
            isAnimationActive: true,
            animationDuration: CHART_ANIMATION.duration,
            animationEasing: CHART_ANIMATION.easing
          },
          s.key
        ))
      ]
    }
  ) });
}
function AreaChart({ data, x, series, options }) {
  const uid = react.useId();
  if (!data.length || !x.key || series.length === 0) {
    return /* @__PURE__ */ jsxRuntime.jsx(ChartEmpty, {});
  }
  const showLegend = shouldShowLegend(series.length, options?.showLegend);
  const seriesLabels = series.map((s) => s.label).join(", ");
  return /* @__PURE__ */ jsxRuntime.jsx(recharts.ResponsiveContainer, { width: "100%", height: "100%", initialDimension: CHART_INITIAL_DIMENSION, children: /* @__PURE__ */ jsxRuntime.jsxs(
    recharts.AreaChart,
    {
      data,
      accessibilityLayer: true,
      "aria-label": `Area chart of ${seriesLabels} by ${x.label}`,
      children: [
        /* @__PURE__ */ jsxRuntime.jsx("defs", { children: series.map((s, index) => /* @__PURE__ */ jsxRuntime.jsxs(
          "linearGradient",
          {
            id: `area-gradient-${uid}-${s.key}`,
            x1: "0",
            y1: "0",
            x2: "0",
            y2: "1",
            children: [
              /* @__PURE__ */ jsxRuntime.jsx("stop", { offset: "0%", stopColor: getChartColor(index), stopOpacity: 0.3 }),
              /* @__PURE__ */ jsxRuntime.jsx("stop", { offset: "100%", stopColor: getChartColor(index), stopOpacity: 0.05 })
            ]
          },
          s.key
        )) }),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.CartesianGrid, { ...CHART_GRID_STYLE }),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.XAxis, { ...CHART_X_AXIS, dataKey: x.key, tickFormatter: shortenLabel }),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.Tooltip, { cursor: false, contentStyle: CHART_TOOLTIP_STYLE }),
        showLegend && /* @__PURE__ */ jsxRuntime.jsx(recharts.Legend, { ...chartLegendProps() }),
        series.map((s, index) => /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Area,
          {
            dataKey: s.key,
            name: s.label,
            type: "monotone",
            stroke: getChartColor(index),
            fill: `url(#area-gradient-${uid}-${s.key})`,
            strokeWidth: 2,
            stackId: options?.stacked ? "stack" : void 0,
            isAnimationActive: true,
            animationDuration: CHART_ANIMATION.duration,
            animationEasing: CHART_ANIMATION.easing
          },
          s.key
        ))
      ]
    }
  ) });
}
function PieChart({ data, x, series, options, donut = false }) {
  const valueKey = series[0]?.key;
  const valueLabel = series[0]?.label ?? "";
  const chartData = react.useMemo(() => {
    if (!data.length || !x.key || !valueKey) return [];
    return data.map((row) => ({
      name: String(row[x.key] ?? ""),
      value: Number(row[valueKey]) || 0
    }));
  }, [data, x.key, valueKey]);
  if (!chartData.length) {
    return /* @__PURE__ */ jsxRuntime.jsx(ChartEmpty, { label: "No data available" });
  }
  const showLegend = shouldShowLegend(chartData.length, options?.showLegend);
  return /* @__PURE__ */ jsxRuntime.jsx(recharts.ResponsiveContainer, { width: "100%", height: "100%", initialDimension: CHART_INITIAL_DIMENSION, children: /* @__PURE__ */ jsxRuntime.jsxs(
    recharts.PieChart,
    {
      accessibilityLayer: true,
      "aria-label": `${donut ? "Donut" : "Pie"} chart of ${valueLabel} by ${x.label}`,
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Pie,
          {
            data: chartData,
            dataKey: "value",
            nameKey: "name",
            cx: "50%",
            cy: "50%",
            innerRadius: donut ? "60%" : 0,
            outerRadius: "80%",
            paddingAngle: 2,
            strokeWidth: 0,
            animationDuration: CHART_ANIMATION.duration,
            animationEasing: CHART_ANIMATION.easing,
            children: chartData.map((_, index) => /* @__PURE__ */ jsxRuntime.jsx(
              recharts.Cell,
              {
                fill: getChartColor(index),
                className: "outline-none focus:outline-none"
              },
              `cell-${index}`
            ))
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Tooltip,
          {
            contentStyle: CHART_TOOLTIP_STYLE,
            formatter: (value) => {
              if (value === void 0 || value === null) return "--";
              return Number(value).toLocaleString();
            }
          }
        ),
        showLegend && // Intentionally diverges from chartLegendProps(): the pie legend uses
        // the full CHART_LEGEND_STYLE plus bottom-aligned circle swatches,
        // since its slices are otherwise unlabeled.
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Legend,
          {
            wrapperStyle: CHART_LEGEND_STYLE,
            verticalAlign: "bottom",
            iconType: "circle",
            iconSize: 8
          }
        )
      ]
    }
  ) });
}
function ScatterChart({ data, x, series, options }) {
  if (!data.length || !x.key || series.length === 0) {
    return /* @__PURE__ */ jsxRuntime.jsx(ChartEmpty, { label: "Configure X-axis and a measure for the scatter plot" });
  }
  const showLegend = shouldShowLegend(series.length, options?.showLegend);
  const seriesLabels = series.map((s) => s.label).join(", ");
  return /* @__PURE__ */ jsxRuntime.jsx(recharts.ResponsiveContainer, { width: "100%", height: "100%", initialDimension: CHART_INITIAL_DIMENSION, children: /* @__PURE__ */ jsxRuntime.jsxs(
    recharts.ScatterChart,
    {
      margin: { top: 10, right: 20, bottom: 20, left: 10 },
      accessibilityLayer: true,
      "aria-label": `Scatter chart of ${seriesLabels} by ${x.label}`,
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(recharts.CartesianGrid, { ...CHART_GRID_STYLE }),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.XAxis, { ...CHART_X_AXIS, dataKey: x.key, type: "number", name: x.label }),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.YAxis, { ...CHART_Y_AXIS, type: "number" }),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.Tooltip, { cursor: { strokeDasharray: "3 3" }, contentStyle: CHART_TOOLTIP_STYLE }),
        showLegend && /* @__PURE__ */ jsxRuntime.jsx(recharts.Legend, { ...chartLegendProps() }),
        series.map((s, index) => /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Scatter,
          {
            name: s.label,
            dataKey: s.key,
            data,
            fill: getChartColor(index),
            isAnimationActive: true,
            animationDuration: CHART_ANIMATION.duration,
            animationEasing: CHART_ANIMATION.easing
          },
          s.key
        ))
      ]
    }
  ) });
}
function toChartOptions(block) {
  const stacked = block.options?.stacked ?? (block.chart_type === "bar_stacked" || block.chart_type === "area_stacked");
  const orientation = block.options?.orientation ?? (block.chart_type === "bar_horizontal" ? "vertical" : void 0);
  return {
    stacked,
    showLegend: block.options?.show_legend,
    orientation
  };
}
function ChartDispatch({ block }) {
  const props = {
    data: block.data,
    x: block.x,
    series: block.series,
    options: toChartOptions(block)
  };
  switch (block.chart_type) {
    case "bar":
    case "bar_horizontal":
    case "bar_grouped":
    case "bar_stacked":
      return /* @__PURE__ */ jsxRuntime.jsx(BarChart, { ...props });
    case "line":
      return /* @__PURE__ */ jsxRuntime.jsx(LineChart2, { ...props });
    case "area":
    case "area_stacked":
      return /* @__PURE__ */ jsxRuntime.jsx(AreaChart, { ...props });
    case "pie":
      return /* @__PURE__ */ jsxRuntime.jsx(PieChart, { ...props });
    case "donut":
      return /* @__PURE__ */ jsxRuntime.jsx(PieChart, { ...props, donut: true });
    case "scatter":
      return /* @__PURE__ */ jsxRuntime.jsx(ScatterChart, { ...props });
    default:
      return /* @__PURE__ */ jsxRuntime.jsx(ChartEmpty, { label: "Unsupported chart type" });
  }
}

// src/aui/csv.ts
var FORMULA_TRIGGERS = ["=", "+", "-", "@", "	", "\r"];
function escapeCell(value) {
  if (value === null || value === void 0) return "";
  let str = String(value);
  if (FORMULA_TRIGGERS.includes(str.charAt(0))) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function rowsToCsv(columns, rows) {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCell(row[c.key] ?? null)).join(",")).join("\n");
  return body ? `${header}
${body}` : header;
}
function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
function ChartBlock({ block }) {
  const [expanded, setExpanded] = react.useState(false);
  const csvColumns = react.useMemo(
    () => [{ key: block.x.key, label: block.x.label }, ...block.series.map((s) => ({ key: s.key, label: s.label }))],
    [block.x, block.series]
  );
  const handleExport = react.useCallback(() => {
    downloadCsv(block.title || "chart", rowsToCsv(csvColumns, block.data));
  }, [block.title, block.data, csvColumns]);
  const openExpand = react.useCallback(() => setExpanded(true), []);
  const closeExpand = react.useCallback(() => setExpanded(false), []);
  return /* @__PURE__ */ jsxRuntime.jsxs(Card, { padding: "sm", children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "mb-3 flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxRuntime.jsx("h4", { className: "truncate text-sm font-semibold", style: { color: "var(--cx-text-primary)" }, children: block.title || "Chart" }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex shrink-0 items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntime.jsx(IconButton, { label: "Download CSV", onClick: handleExport, children: /* @__PURE__ */ jsxRuntime.jsx(DownloadIcon, {}) }),
        /* @__PURE__ */ jsxRuntime.jsx(IconButton, { label: "Expand chart", onClick: openExpand, children: /* @__PURE__ */ jsxRuntime.jsx(ExpandIcon, {}) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx("div", { className: "h-64 min-h-64 w-full min-w-0", children: /* @__PURE__ */ jsxRuntime.jsx(ChartDispatch, { block }) }),
    /* @__PURE__ */ jsxRuntime.jsx(Dialog, { open: expanded, onClose: closeExpand, title: block.title || "Chart", children: /* @__PURE__ */ jsxRuntime.jsx("div", { className: "h-[60vh] w-full min-w-0", children: /* @__PURE__ */ jsxRuntime.jsx(ChartDispatch, { block }) }) })
  ] });
}
function IconButton({
  label,
  onClick,
  children
}) {
  return /* @__PURE__ */ jsxRuntime.jsx(
    "button",
    {
      type: "button",
      onClick,
      "aria-label": label,
      title: label,
      className: "rounded-md p-1.5 transition-colors hover:bg-[var(--cx-canvas-muted)] focus:outline-none focus-visible:ring-2",
      style: { color: "var(--cx-text-muted)" },
      children
    }
  );
}
function ExpandIcon() {
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsxRuntime.jsx("polyline", { points: "15 3 21 3 21 9" }),
        /* @__PURE__ */ jsxRuntime.jsx("polyline", { points: "9 21 3 21 3 15" }),
        /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "21", y1: "3", x2: "14", y2: "10" }),
        /* @__PURE__ */ jsxRuntime.jsx("line", { x1: "3", y1: "21", x2: "10", y2: "14" })
      ]
    }
  );
}
function Table({ className, style, ...props }) {
  return /* @__PURE__ */ jsxRuntime.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntime.jsx(
    "table",
    {
      className: cn("min-w-full", className),
      style: { borderCollapse: "collapse", ...style },
      ...props
    }
  ) });
}
function Thead(props) {
  return /* @__PURE__ */ jsxRuntime.jsx("thead", { ...props });
}
function Tbody(props) {
  return /* @__PURE__ */ jsxRuntime.jsx("tbody", { ...props });
}
function Tr({ style, ...props }) {
  return /* @__PURE__ */ jsxRuntime.jsx("tr", { style: { borderTop: "1px solid var(--cx-border-subtle)", ...style }, ...props });
}
function Th({ className, style, ...props }) {
  return /* @__PURE__ */ jsxRuntime.jsx(
    "th",
    {
      className: cn(
        "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider",
        className
      ),
      style: { color: "var(--cx-text-muted)", backgroundColor: "var(--cx-canvas-subtle)", ...style },
      ...props
    }
  );
}
function Td({ className, style, ...props }) {
  return /* @__PURE__ */ jsxRuntime.jsx(
    "td",
    {
      className: cn("whitespace-nowrap px-4 py-3 text-sm", className),
      style: { color: "var(--cx-text-secondary)", ...style },
      ...props
    }
  );
}

// src/aui/sort.ts
function sortRows(rows, sort) {
  if (!sort) return rows;
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    if (av === null || av === void 0) return 1;
    if (bv === null || bv === void 0) return -1;
    if (isNumeric(av) && isNumeric(bv)) return (Number(av) - Number(bv)) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}
var DEFAULT_PAGE_SIZE = 10;
function TableBlock({ block }) {
  const [sort, setSort] = react.useState(null);
  const [page, setPage] = react.useState(0);
  const [viewAll, setViewAll] = react.useState(false);
  const pageSize = block.page_size && block.page_size > 0 ? block.page_size : DEFAULT_PAGE_SIZE;
  const sortedRows = react.useMemo(() => sortRows(block.rows, sort), [block.rows, sort]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = react.useMemo(
    () => sortedRows.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [sortedRows, safePage, pageSize]
  );
  const toggleSort = react.useCallback((key) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null;
    });
    setPage(0);
  }, []);
  const handleExport = react.useCallback(() => {
    downloadCsv(block.title || "table", rowsToCsv(block.columns, block.rows));
  }, [block.title, block.columns, block.rows]);
  const totalCount = block.total_count ?? block.rows.length;
  const hasMoreThanEmbedded = totalCount > block.rows.length;
  const openViewAll = react.useCallback(() => setViewAll(true), []);
  const closeViewAll = react.useCallback(() => setViewAll(false), []);
  if (block.columns.length === 0) return null;
  return /* @__PURE__ */ jsxRuntime.jsxs(Card, { padding: "sm", children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "mb-3 flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxRuntime.jsx("h4", { className: "truncate text-sm font-semibold", style: { color: "var(--cx-text-primary)" }, children: block.title || "Results" }),
      /* @__PURE__ */ jsxRuntime.jsx(
        "button",
        {
          type: "button",
          onClick: handleExport,
          "aria-label": "Download CSV",
          title: "Download CSV",
          className: "shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--cx-canvas-muted)] focus:outline-none focus-visible:ring-2",
          style: { color: "var(--cx-text-muted)" },
          children: /* @__PURE__ */ jsxRuntime.jsx(DownloadIcon, {})
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx(DataTable, { columns: block.columns, rows: pagedRows, sort, onSort: toggleSort }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "mt-3 flex items-center justify-between text-xs", style: { color: "var(--cx-text-muted)" }, children: [
      /* @__PURE__ */ jsxRuntime.jsxs("span", { children: [
        "Showing ",
        pagedRows.length,
        " of ",
        sortedRows.length,
        hasMoreThanEmbedded ? ` (${totalCount.toLocaleString()} total)` : ""
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2", children: [
        pageCount > 1 && /* @__PURE__ */ jsxRuntime.jsx(Pagination, { page: safePage, pageCount, onChange: setPage }),
        block.rows.length > pageSize && /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            type: "button",
            onClick: openViewAll,
            className: "font-medium",
            style: { color: "var(--cx-accent)" },
            children: "View all"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs(Dialog, { open: viewAll, onClose: closeViewAll, title: block.title || "Results", children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { className: "max-h-[60vh] overflow-y-auto", children: /* @__PURE__ */ jsxRuntime.jsx(DataTable, { columns: block.columns, rows: sortedRows, sort, onSort: toggleSort }) }),
      hasMoreThanEmbedded && /* @__PURE__ */ jsxRuntime.jsxs("p", { className: "mt-3 text-xs", style: { color: "var(--cx-text-muted)" }, children: [
        "Showing the first ",
        block.rows.length.toLocaleString(),
        " of ",
        totalCount.toLocaleString(),
        " rows."
      ] })
    ] })
  ] });
}
function DataTable({
  columns,
  rows,
  sort,
  onSort
}) {
  return /* @__PURE__ */ jsxRuntime.jsxs(Table, { children: [
    /* @__PURE__ */ jsxRuntime.jsx(Thead, { children: /* @__PURE__ */ jsxRuntime.jsx(Tr, { children: columns.map((col) => /* @__PURE__ */ jsxRuntime.jsx(Th, { className: alignClass(col), children: /* @__PURE__ */ jsxRuntime.jsxs(
      "button",
      {
        type: "button",
        onClick: () => onSort(col.key),
        className: "inline-flex items-center gap-1 uppercase tracking-wider",
        "aria-label": `Sort by ${col.label}`,
        children: [
          col.label,
          /* @__PURE__ */ jsxRuntime.jsx(SortGlyph, { active: sort?.key === col.key, direction: sort?.direction })
        ]
      }
    ) }, col.key)) }) }),
    /* @__PURE__ */ jsxRuntime.jsx(Tbody, { children: rows.map((row, rowIdx) => /* @__PURE__ */ jsxRuntime.jsx(Tr, { children: columns.map((col) => /* @__PURE__ */ jsxRuntime.jsx(Td, { className: alignClass(col, row[col.key]), children: formatWithUnit(row[col.key] ?? null, col.format, col.unit) }, col.key)) }, rowIdx)) })
  ] });
}
function Pagination({
  page,
  pageCount,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-1.5", children: [
    /* @__PURE__ */ jsxRuntime.jsx(
      "button",
      {
        type: "button",
        onClick: () => onChange(Math.max(0, page - 1)),
        disabled: page === 0,
        className: "rounded p-1 hover:bg-[var(--cx-canvas-muted)] disabled:opacity-40",
        "aria-label": "Previous page",
        children: /* @__PURE__ */ jsxRuntime.jsx(ChevronIcon, { direction: "left" })
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsxs("span", { children: [
      page + 1,
      " / ",
      pageCount
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx(
      "button",
      {
        type: "button",
        onClick: () => onChange(Math.min(pageCount - 1, page + 1)),
        disabled: page >= pageCount - 1,
        className: "rounded p-1 hover:bg-[var(--cx-canvas-muted)] disabled:opacity-40",
        "aria-label": "Next page",
        children: /* @__PURE__ */ jsxRuntime.jsx(ChevronIcon, { direction: "right" })
      }
    )
  ] });
}
function alignClass(col, value) {
  const align = col.align ?? (col.format && col.format !== "raw" ? "right" : value !== void 0 && isNumeric(value) ? "right" : "left");
  return cn(align === "right" && "text-right", align === "center" && "text-center");
}
function SortGlyph({ active, direction }) {
  if (!active) {
    return /* @__PURE__ */ jsxRuntime.jsx("span", { style: { color: "var(--cx-text-muted)", opacity: 0.5 }, "aria-hidden": "true", children: "\u2195" });
  }
  return /* @__PURE__ */ jsxRuntime.jsx("span", { style: { color: "var(--cx-text-secondary)" }, "aria-hidden": "true", children: direction === "asc" ? "\u2191" : "\u2193" });
}
function ChevronIcon({ direction }) {
  return /* @__PURE__ */ jsxRuntime.jsx(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: "12",
      height: "12",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: direction === "left" ? /* @__PURE__ */ jsxRuntime.jsx("polyline", { points: "15 18 9 12 15 6" }) : /* @__PURE__ */ jsxRuntime.jsx("polyline", { points: "9 18 15 12 9 6" })
    }
  );
}

// src/aui/blocks/inline-markdown.ts
var PLACEHOLDER_PREFIX = "&lt;CXC-CODE:";
var PLACEHOLDER_SUFFIX = "&gt;";
var PLACEHOLDER_RE = /&lt;CXC-CODE:(\d+)&gt;/g;
function renderInlineMarkdown(text) {
  if (!text) return "";
  let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const codeSpans = [];
  html = html.replace(/`([^`\n]+)`/g, (_match, code) => {
    const index = codeSpans.push(`<code class="cxc-aui-inline-code">${code}</code>`) - 1;
    return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
  });
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s"'<>)]+)\)/g,
    (_match, label, url) => {
      const href = url.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="cxc-aui-link">${label}</a>`;
    }
  );
  html = html.replace(/\n/g, "<br />");
  html = html.replace(PLACEHOLDER_RE, (match, index) => {
    const span = codeSpans[Number(index)];
    return span ?? match;
  });
  return html;
}
function TextBlock({ block }) {
  const html = react.useMemo(() => renderInlineMarkdown(block.markdown), [block.markdown]);
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      className: "text-sm leading-relaxed",
      style: { color: "var(--cx-text-secondary)" },
      dangerouslySetInnerHTML: { __html: html }
    }
  );
}
var sizeClasses = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
  lg: "px-4 py-2.5 text-sm"
};
var variantStyles = {
  primary: {
    backgroundColor: "var(--cx-accent)",
    color: "var(--cxc-text-inverse)",
    border: "1px solid var(--cx-accent)",
    boxShadow: "var(--cxc-shadow-sm)"
  },
  secondary: {
    backgroundColor: "var(--cx-canvas)",
    color: "var(--cx-text-secondary)",
    border: "1px solid var(--cx-border)",
    boxShadow: "var(--cxc-shadow-sm)"
  }
};
var Button = react.forwardRef(
  ({ variant = "primary", size = "md", className, style, disabled, ...props }, ref) => {
    return /* @__PURE__ */ jsxRuntime.jsx(
      "button",
      {
        ref,
        disabled,
        className: cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md font-medium",
          "transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          sizeClasses[size],
          className
        ),
        style: { ...variantStyles[variant], ...style },
        ...props
      }
    );
  }
);
Button.displayName = "AuiButton";
function ActionsBlock({ block, onSendMessage }) {
  if (block.actions.length === 0) return null;
  return /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex flex-wrap gap-2", children: block.actions.map((action, index) => (
    // Composite key: agent-supplied ids may collide, so pair with the index
    // (matches the pattern in aui-view.tsx / table-block.tsx).
    /* @__PURE__ */ jsxRuntime.jsx(
      ActionButton,
      {
        action,
        onSendMessage
      },
      `${action.id ?? "a"}-${index}`
    )
  )) });
}
function ActionButton({
  action,
  onSendMessage
}) {
  return /* @__PURE__ */ jsxRuntime.jsx(
    Button,
    {
      size: "sm",
      variant: action.style === "primary" ? "primary" : "secondary",
      onClick: () => onSendMessage(action.on_click.send_message),
      children: action.label
    }
  );
}
var REGISTRY = {
  metric_group: ({ block }) => block.type === "metric_group" ? /* @__PURE__ */ jsxRuntime.jsx(MetricGroupBlock, { block }) : null,
  chart: ({ block }) => block.type === "chart" ? /* @__PURE__ */ jsxRuntime.jsx(ChartBlock, { block }) : null,
  table: ({ block }) => block.type === "table" ? /* @__PURE__ */ jsxRuntime.jsx(TableBlock, { block }) : null,
  text: ({ block }) => block.type === "text" ? /* @__PURE__ */ jsxRuntime.jsx(TextBlock, { block }) : null,
  actions: ({ block, onSendMessage }) => block.type === "actions" ? /* @__PURE__ */ jsxRuntime.jsx(ActionsBlock, { block, onSendMessage }) : null
};
function resolveBlock(block) {
  const renderer = REGISTRY[block.type];
  if (!renderer) {
    console.warn("[aui] no renderer for block type:", block.type);
    return null;
  }
  return renderer;
}
var BlockErrorBoundary = class extends react.Component {
  constructor() {
    super(...arguments);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error(`[aui] block "${this.props.blockType}" failed to render:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return /* @__PURE__ */ jsxRuntime.jsx(
        "div",
        {
          className: "rounded-md border px-3 py-2 text-xs",
          style: {
            borderColor: "var(--cx-border)",
            color: "var(--cx-text-muted)"
          },
          role: "status",
          children: "This block could not be displayed."
        }
      );
    }
    return this.props.children;
  }
};
function AuiView({ spec, onSendMessage }) {
  const blocks = react.useMemo(
    () => Array.isArray(spec.blocks) ? spec.blocks.filter(isValidBlock) : [],
    [spec.blocks]
  );
  if (blocks.length === 0) return null;
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "section",
    {
      className: "space-y-3 rounded-lg border p-3",
      style: { borderColor: "var(--cx-border-subtle)", backgroundColor: "var(--cx-canvas-subtle)" },
      "aria-label": spec.title || "Data view",
      children: [
        spec.title && /* @__PURE__ */ jsxRuntime.jsx("h3", { className: "text-sm font-semibold", style: { color: "var(--cx-text-primary)" }, children: spec.title }),
        blocks.map((block, index) => {
          const Renderer = resolveBlock(block);
          if (!Renderer) return null;
          return /* @__PURE__ */ jsxRuntime.jsx(BlockErrorBoundary, { blockType: block.type, children: /* @__PURE__ */ jsxRuntime.jsx(Renderer, { block, onSendMessage }) }, `${block.type}-${index}`);
        })
      ]
    }
  );
}
function ChatMessage({
  message,
  isStreaming = false,
  isLast = false,
  onRetry,
  className
}) {
  const { config, send, selectFollowup, submitFeedback, removeFeedback, editAndRegenerate, regenerateLast } = useChatContext();
  const [reasoningOpen, setReasoningOpen] = react.useState(isStreaming);
  const reasoningRef = react.useRef(null);
  const [reasoningHeight, setReasoningHeight] = react.useState(0);
  const [editing, setEditing] = react.useState(false);
  const [editText, setEditText] = react.useState(message.content);
  const editTextareaRef = react.useRef(null);
  const [feedbackOpen, setFeedbackOpen] = react.useState(false);
  const toggleReasoning = react.useCallback(() => {
    setReasoningOpen((prev) => !prev);
  }, []);
  react.useEffect(() => {
    const el = reasoningRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setReasoningHeight(el.scrollHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  react.useEffect(() => {
    if (editing && editTextareaRef.current) {
      editTextareaRef.current.focus();
      const len = editTextareaRef.current.value.length;
      editTextareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);
  const renderedContent = react.useMemo(() => {
    if (message.role === "user" || !message.content) return null;
    return renderMarkdown(message.content);
  }, [message.role, message.content]);
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const hasContent = message.content.length > 0;
  const hasActions = (message.actions?.length ?? 0) > 0;
  const hasReasoning = Boolean(message.reasoning);
  const hasFollowups = Boolean(message.followups);
  const hasBlocks = (message.blocks?.length ?? 0) > 0;
  const showThinking = isStreaming && !hasContent && !hasActions;
  const enableEdit = isUser && isLast && config.enableRegenerate === true;
  const enableRegenButton = isAssistant && isLast && config.enableRegenerate === true && !isStreaming;
  const feedbackEnabled = isAssistant && Boolean(config.feedback) && Boolean(message.backendMessageId) && !isStreaming;
  const handleEditSubmit = react.useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setEditing(false);
    editAndRegenerate(trimmed);
  }, [editText, editAndRegenerate]);
  const handleEditCancel = react.useCallback(() => {
    setEditing(false);
    setEditText(message.content);
  }, [message.content]);
  const handleFeedbackClick = react.useCallback(
    (rating) => {
      if (message.feedback?.rating === rating) {
        void removeFeedback(message.id);
        setFeedbackOpen(false);
        return;
      }
      if (rating === "up") {
        void submitFeedback(message.id, { rating: "up" });
      } else {
        setFeedbackOpen(true);
      }
    },
    [message.feedback?.rating, message.id, submitFeedback, removeFeedback]
  );
  return /* @__PURE__ */ jsxRuntime.jsx(
    react$1.motion.div,
    {
      role: "article",
      "aria-label": isUser ? "Your message" : "Assistant message",
      initial: { opacity: 0, y: 6 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] },
      className: cn(
        "group/message py-3",
        isUser && !editing && "flex justify-end",
        className
      ),
      children: isUser ? editing ? (
        /* === User Message: Inline Edit Mode === */
        /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-col gap-2 w-full", children: [
          /* @__PURE__ */ jsxRuntime.jsx(
            "textarea",
            {
              ref: editTextareaRef,
              value: editText,
              onChange: (e) => setEditText(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleEditSubmit();
                }
                if (e.key === "Escape") handleEditCancel();
              },
              rows: Math.min(8, Math.max(2, editText.split("\n").length)),
              className: cn(
                "w-full resize-none rounded-[var(--cxc-radius-md)] px-3.5 py-2.5 text-[15px]",
                "outline-none focus-visible:ring-2 focus-visible:ring-[var(--cxc-border-focus)]"
              ),
              style: {
                backgroundColor: "var(--cxc-bg-subtle)",
                color: "var(--cxc-text)",
                border: "1px solid var(--cxc-border)",
                lineHeight: "1.55"
              }
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex justify-end gap-1.5", children: [
            /* @__PURE__ */ jsxRuntime.jsx(
              "button",
              {
                type: "button",
                onClick: handleEditCancel,
                className: "rounded-full px-3 py-1.5 text-[13px]",
                style: { color: "var(--cxc-text-secondary)" },
                children: "Cancel"
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsx(
              "button",
              {
                type: "button",
                onClick: handleEditSubmit,
                disabled: !editText.trim(),
                className: cn(
                  "rounded-full px-3.5 py-1.5 text-[13px] font-medium",
                  "transition-opacity duration-100",
                  editText.trim() ? "opacity-100" : "opacity-40 cursor-not-allowed"
                ),
                style: {
                  backgroundColor: "var(--cxc-text)",
                  color: "var(--cxc-bg)"
                },
                children: "Send"
              }
            )
          ] })
        ] })
      ) : (
        /* === User Message: Right-aligned dark pill === */
        /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-col items-end gap-1 max-w-[80%]", children: [
          /* @__PURE__ */ jsxRuntime.jsx(
            "div",
            {
              className: "rounded-[22px] px-5 py-3",
              style: {
                backgroundColor: "var(--cxc-user-bg)",
                color: "var(--cxc-user-text)",
                borderBottomRightRadius: "var(--cxc-radius-sm)"
              },
              children: /* @__PURE__ */ jsxRuntime.jsx("p", { className: "text-[15px] whitespace-pre-wrap break-words leading-[1.55]", children: message.content })
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsx(
            MessageActionBar,
            {
              content: message.content,
              onEdit: enableEdit ? () => setEditing(true) : void 0
            }
          )
        ] })
      ) : isAssistant ? (
        /* === Assistant Message: Left-aligned, no bubble === */
        /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "w-full", style: { color: "var(--cxc-assistant-text)" }, children: [
          hasReasoning && /* @__PURE__ */ jsxRuntime.jsxs(
            "div",
            {
              className: "mb-3 rounded-[var(--cxc-radius-md)] overflow-hidden",
              style: {
                backgroundColor: "var(--cxc-bg-subtle)",
                border: "1px solid var(--cxc-border-subtle)"
              },
              children: [
                /* @__PURE__ */ jsxRuntime.jsxs(
                  "button",
                  {
                    type: "button",
                    onClick: toggleReasoning,
                    className: "flex items-center gap-2 w-full px-3.5 py-2.5 text-left transition-colors duration-150",
                    "aria-expanded": reasoningOpen,
                    children: [
                      /* @__PURE__ */ jsxRuntime.jsx(
                        "span",
                        {
                          className: "text-xs font-medium tracking-wide uppercase",
                          style: { color: "var(--cxc-text-muted)" },
                          children: "Reasoning"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntime.jsx(
                        lucideReact.ChevronDown,
                        {
                          size: 12,
                          className: "transition-transform duration-300",
                          style: {
                            color: "var(--cxc-text-muted)",
                            transform: reasoningOpen ? "rotate(180deg)" : "rotate(0deg)",
                            transitionTimingFunction: "var(--cxc-ease-accordion)"
                          }
                        }
                      )
                    ]
                  }
                ),
                /* @__PURE__ */ jsxRuntime.jsx(
                  "div",
                  {
                    className: "overflow-hidden transition-all duration-300",
                    style: {
                      maxHeight: reasoningOpen ? `${reasoningHeight}px` : "0px",
                      opacity: reasoningOpen ? 1 : 0,
                      transitionTimingFunction: "var(--cxc-ease-accordion)"
                    },
                    children: /* @__PURE__ */ jsxRuntime.jsx(
                      "div",
                      {
                        ref: reasoningRef,
                        className: "px-3.5 pb-3 text-[13px]",
                        style: {
                          color: "var(--cxc-text-secondary)",
                          borderTop: "1px solid var(--cxc-border-subtle)"
                        },
                        children: /* @__PURE__ */ jsxRuntime.jsx("p", { className: "whitespace-pre-wrap leading-[1.65] pt-2.5", children: message.reasoning })
                      }
                    )
                  }
                )
              ]
            }
          ),
          hasActions && message.actions && /* @__PURE__ */ jsxRuntime.jsx(
            ChainOfThought,
            {
              actions: message.actions,
              isActive: isStreaming
            }
          ),
          showThinking && /* @__PURE__ */ jsxRuntime.jsx(ThinkingIndicator, {}),
          hasContent && renderedContent && /* @__PURE__ */ jsxRuntime.jsx(
            "div",
            {
              className: "cxc-markdown text-[15px] leading-[1.7]",
              dangerouslySetInnerHTML: { __html: renderedContent }
            }
          ),
          hasBlocks && message.blocks && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "mt-3 space-y-3", children: message.blocks.map((spec, index) => /* @__PURE__ */ jsxRuntime.jsx(
            AuiView,
            {
              spec,
              onSendMessage: send
            },
            `${spec.surface_id}-${index}`
          )) }),
          hasFollowups && message.followups && !isStreaming && /* @__PURE__ */ jsxRuntime.jsx(
            FollowupsCard,
            {
              followups: message.followups,
              lockedSelection: message.followupsSelection ?? (isLast ? void 0 : []),
              onSelect: (opts) => selectFollowup(message.id, opts)
            }
          ),
          message.error && /* @__PURE__ */ jsxRuntime.jsx(
            "div",
            {
              className: "flex items-center gap-2.5 mt-3 text-[13px]",
              role: "alert",
              children: /* @__PURE__ */ jsxRuntime.jsx("span", { style: { color: "var(--cxc-error)" }, children: message.content || "An error occurred" })
            }
          ),
          hasContent && !isStreaming && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "relative mt-1.5", children: [
            /* @__PURE__ */ jsxRuntime.jsx(
              MessageActionBar,
              {
                content: message.content,
                onRetry: message.error ? onRetry : enableRegenButton ? regenerateLast : void 0,
                feedback: feedbackEnabled ? message.feedback : null,
                onFeedback: feedbackEnabled ? handleFeedbackClick : void 0
              }
            ),
            feedbackOpen && feedbackEnabled && /* @__PURE__ */ jsxRuntime.jsx(
              FeedbackPopover,
              {
                rating: "down",
                onSubmit: (reason) => {
                  void submitFeedback(message.id, {
                    rating: "down",
                    reasonCategory: reason.category,
                    reasonText: reason.text
                  });
                  setFeedbackOpen(false);
                },
                onDismiss: () => setFeedbackOpen(false),
                className: "bottom-full left-0 mb-2"
              }
            )
          ] })
        ] })
      ) : null
    }
  );
}
function EmptyState({
  icon,
  title = "How can I help you?",
  description = "Ask me anything to get started.",
  suggestions,
  onSuggestionClick,
  className
}) {
  return /* @__PURE__ */ jsxRuntime.jsxs(
    react$1.motion.div,
    {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
      className: cn(
        "flex flex-1 flex-col items-center justify-center px-6 py-16",
        className
      ),
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            className: "mb-6",
            "aria-hidden": "true",
            children: icon ?? /* @__PURE__ */ jsxRuntime.jsx(
              lucideReact.Sparkles,
              {
                size: 32,
                strokeWidth: 1.5,
                style: { color: "var(--cxc-text-muted)" }
              }
            )
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          "h2",
          {
            className: "mb-2 text-xl font-medium tracking-tight",
            style: {
              color: "var(--cxc-text)",
              letterSpacing: "-0.01em"
            },
            children: title
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          "p",
          {
            className: "mb-8 max-w-sm text-center text-[15px]",
            style: { color: "var(--cxc-text-muted)" },
            children: description
          }
        ),
        suggestions && suggestions.length > 0 && /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            className: "flex max-w-lg flex-wrap items-center justify-center gap-2.5",
            role: "list",
            "aria-label": "Suggested prompts",
            children: suggestions.map((suggestion, index) => /* @__PURE__ */ jsxRuntime.jsx(
              react$1.motion.button,
              {
                role: "listitem",
                initial: { opacity: 0, y: 8 },
                animate: { opacity: 1, y: 0 },
                transition: {
                  duration: 0.3,
                  delay: index * 0.05,
                  ease: "easeOut"
                },
                whileHover: { y: -1 },
                whileTap: { scale: 0.98 },
                onClick: () => onSuggestionClick?.(suggestion),
                className: cn(
                  "rounded-full border px-4 py-2.5 text-[14px]",
                  "transition-all duration-150"
                ),
                style: {
                  borderColor: "var(--cxc-border)",
                  color: "var(--cxc-text-secondary)",
                  backgroundColor: "var(--cxc-bg)"
                },
                onMouseEnter: (e) => {
                  e.currentTarget.style.backgroundColor = "var(--cxc-bg-subtle)";
                  e.currentTarget.style.borderColor = "var(--cxc-border-focus)";
                  e.currentTarget.style.color = "var(--cxc-text)";
                  e.currentTarget.style.boxShadow = "var(--cxc-shadow-sm)";
                },
                onMouseLeave: (e) => {
                  e.currentTarget.style.backgroundColor = "var(--cxc-bg)";
                  e.currentTarget.style.borderColor = "var(--cxc-border)";
                  e.currentTarget.style.color = "var(--cxc-text-secondary)";
                  e.currentTarget.style.boxShadow = "none";
                },
                children: suggestion
              },
              suggestion
            ))
          }
        )
      ]
    }
  );
}
var MessageList = react.forwardRef(
  function MessageList2({ renderMessage, className }, ref) {
    const { state } = useChatContext();
    const { messages, isStreaming } = state;
    const {
      scrollRef,
      bottomRef,
      isAtBottom,
      unreadCount,
      scrollToBottom
    } = useChatScroll([messages.length, messages[messages.length - 1]?.content.length]);
    const handleScrollToBottom = react.useCallback(() => {
      scrollToBottom("smooth");
    }, [scrollToBottom]);
    const lastMessage = messages[messages.length - 1];
    isStreaming && lastMessage?.role === "assistant" && lastMessage.content === "" && !lastMessage.actions?.length;
    if (messages.length === 0) {
      return /* @__PURE__ */ jsxRuntime.jsx(
        "div",
        {
          ref,
          className: cn("flex flex-1 overflow-hidden", className),
          role: "log",
          "aria-label": "Messages",
          "aria-live": "polite",
          "aria-relevant": "additions",
          children: /* @__PURE__ */ jsxRuntime.jsx(EmptyState, {})
        }
      );
    }
    return /* @__PURE__ */ jsxRuntime.jsxs(
      "div",
      {
        ref,
        className: cn("relative flex flex-1 flex-col overflow-hidden", className),
        children: [
          /* @__PURE__ */ jsxRuntime.jsx(
            "div",
            {
              ref: scrollRef,
              className: "flex-1 overflow-y-auto overflow-x-hidden cxc-scrollbar",
              role: "log",
              "aria-label": "Messages",
              "aria-live": "polite",
              "aria-relevant": "additions",
              style: { scrollBehavior: "smooth" },
              children: /* @__PURE__ */ jsxRuntime.jsxs(
                "div",
                {
                  className: "mx-auto w-full px-5 py-6 sm:px-8",
                  style: { maxWidth: "var(--cxc-content-max-width)" },
                  children: [
                    /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { initial: false, children: messages.map((message, index) => {
                      if (message.role === "assistant" && message.isStreaming && message.content === "" && !message.actions?.length) {
                        return /* @__PURE__ */ jsxRuntime.jsx("div", { className: "py-3", children: /* @__PURE__ */ jsxRuntime.jsx(ThinkingIndicator, {}) }, message.id);
                      }
                      if (renderMessage) {
                        return /* @__PURE__ */ jsxRuntime.jsx("div", { children: renderMessage(message, index) }, message.id);
                      }
                      return /* @__PURE__ */ jsxRuntime.jsx(
                        ChatMessage,
                        {
                          message,
                          isStreaming: message.isStreaming,
                          isLast: index === messages.length - 1
                        },
                        message.id
                      );
                    }) }),
                    /* @__PURE__ */ jsxRuntime.jsx("div", { ref: bottomRef, className: "h-px w-full", "aria-hidden": "true" })
                  ]
                }
              )
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { children: !isAtBottom && /* @__PURE__ */ jsxRuntime.jsxs(
            react$1.motion.button,
            {
              initial: { opacity: 0, y: 8, scale: 0.95 },
              animate: { opacity: 1, y: 0, scale: 1 },
              exit: { opacity: 0, y: 8, scale: 0.95 },
              transition: { type: "spring", stiffness: 400, damping: 30 },
              onClick: handleScrollToBottom,
              className: cn(
                "absolute bottom-4 left-1/2 -translate-x-1/2",
                "flex items-center gap-1.5 rounded-full px-3.5 py-2",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2"
              ),
              style: {
                backgroundColor: "var(--cxc-bg)",
                border: "1px solid var(--cxc-border)",
                color: "var(--cxc-text-secondary)",
                boxShadow: "var(--cxc-shadow-md)"
              },
              "aria-label": unreadCount > 0 ? `Scroll to latest messages (${unreadCount} new)` : "Scroll to latest messages",
              children: [
                /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ArrowDown, { size: 14 }),
                unreadCount > 0 && /* @__PURE__ */ jsxRuntime.jsx(
                  "span",
                  {
                    className: "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium",
                    style: {
                      backgroundColor: "var(--cxc-accent)",
                      color: "var(--cxc-text-inverse)"
                    },
                    children: unreadCount > 99 ? "99+" : unreadCount
                  }
                )
              ]
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsx("div", { className: "sr-only", "aria-live": "polite", "aria-atomic": "false", children: lastMessage?.role === "assistant" && !lastMessage.isStreaming && lastMessage.content && /* @__PURE__ */ jsxRuntime.jsx("span", { children: "New message from assistant" }) })
        ]
      }
    );
  }
);
var fileIdCounter = 0;
function createFileAttachment(file) {
  return {
    id: `file_${Date.now()}_${++fileIdCounter}`,
    file,
    name: file.name,
    size: file.size,
    type: file.type
  };
}
function PromptInput({
  placeholder,
  disabled,
  maxRows = 6,
  maxHeight = 240,
  allowAttachments = false,
  acceptFileTypes,
  onFilesAttached,
  suggestions,
  onSuggestionClick,
  addonSlot,
  className
}) {
  const { state, config, send, stop, setInput } = useChatContext();
  const textareaRef = react.useRef(null);
  const fileInputRef = react.useRef(null);
  const [attachments, setAttachments] = react.useState([]);
  const [isDragging, setIsDragging] = react.useState(false);
  const dragCounter = react.useRef(0);
  const resolvedPlaceholder = placeholder ?? config.placeholder ?? "Message...";
  const maxLength = config.maxInputLength ?? 1e4;
  const isStreaming = state.isStreaming;
  const inputValue = state.inputValue;
  const isDisabled = disabled || false;
  const canSend = inputValue.trim().length > 0 && !isStreaming && !isDisabled;
  const showCharCount = inputValue.length > maxLength * 0.9;
  const isOverLimit = inputValue.length > maxLength;
  const showSuggestions = suggestions && suggestions.length > 0 && !inputValue && !isStreaming;
  const adjustHeight = react.useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
    const maxByRows = lineHeight * maxRows;
    const limit = Math.min(maxByRows, maxHeight);
    textarea.style.height = `${Math.min(textarea.scrollHeight, limit)}px`;
  }, [maxRows, maxHeight]);
  react.useEffect(() => {
    adjustHeight();
  }, [inputValue, adjustHeight]);
  react.useEffect(() => {
    if (config.autoFocus !== false) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [config.autoFocus]);
  const handleChange = react.useCallback(
    (e) => setInput(e.target.value),
    [setInput]
  );
  const handleKeyDown = react.useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canSend) send(inputValue);
      }
      if (e.key === "Escape" && isStreaming) stop();
    },
    [canSend, inputValue, isStreaming, send, stop]
  );
  const handleSendClick = react.useCallback(() => {
    if (isStreaming) {
      stop();
    } else if (canSend) {
      send(inputValue);
      textareaRef.current?.focus();
    }
  }, [isStreaming, canSend, inputValue, send, stop]);
  const addFiles = react.useCallback(
    (files) => {
      const newAttachments = Array.from(files).map(createFileAttachment);
      setAttachments((prev) => [...prev, ...newAttachments]);
      onFilesAttached?.(newAttachments);
    },
    [onFilesAttached]
  );
  const removeAttachment = react.useCallback((id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);
  const handleFileClick = react.useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleFileChange = react.useCallback(
    (e) => {
      if (e.target.files?.length) {
        addFiles(e.target.files);
        e.target.value = "";
      }
    },
    [addFiles]
  );
  const handleDragEnter = react.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);
  const handleDragLeave = react.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);
  const handleDragOver = react.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const handleDrop = react.useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );
  const handleSuggestionClick = react.useCallback(
    (suggestion) => {
      if (onSuggestionClick) {
        onSuggestionClick(suggestion);
      } else {
        setInput(suggestion);
        setTimeout(() => send(suggestion), 50);
      }
    },
    [onSuggestionClick, setInput, send]
  );
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      className: cn(
        "cxc-prompt-input-wrap relative mx-auto flex w-full flex-col gap-2 px-5 pb-4 pt-2 sm:px-8",
        className
      ),
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { children: showSuggestions && /* @__PURE__ */ jsxRuntime.jsx(
          react$1.motion.div,
          {
            initial: { opacity: 0, y: 8 },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: 8 },
            transition: { duration: 0.15 },
            className: "flex flex-wrap gap-2 pb-1",
            children: suggestions.map((suggestion) => /* @__PURE__ */ jsxRuntime.jsx(
              "button",
              {
                type: "button",
                onClick: () => handleSuggestionClick(suggestion),
                className: cn(
                  "px-3.5 py-1.5 text-[13px]",
                  "rounded-[var(--cxc-radius-full)]",
                  "transition-colors duration-100",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-[var(--cxc-border-focus)]"
                ),
                style: {
                  backgroundColor: "var(--cxc-bg-subtle)",
                  color: "var(--cxc-text-secondary)",
                  border: "1px solid var(--cxc-border-subtle)"
                },
                onMouseOver: (e) => {
                  e.currentTarget.style.backgroundColor = "var(--cxc-bg-muted)";
                  e.currentTarget.style.borderColor = "var(--cxc-border)";
                  e.currentTarget.style.color = "var(--cxc-text)";
                },
                onMouseOut: (e) => {
                  e.currentTarget.style.backgroundColor = "var(--cxc-bg-subtle)";
                  e.currentTarget.style.borderColor = "var(--cxc-border-subtle)";
                  e.currentTarget.style.color = "var(--cxc-text-secondary)";
                },
                children: suggestion
              },
              suggestion
            ))
          }
        ) }),
        /* @__PURE__ */ jsxRuntime.jsxs(
          "div",
          {
            className: cn(
              "relative flex flex-col rounded-[20px]",
              "transition-all duration-200",
              isDragging && "ring-2 ring-[var(--cxc-border-focus)]"
            ),
            style: {
              backgroundColor: "var(--cxc-input-bg)",
              border: "1px solid var(--cxc-input-border)",
              boxShadow: "var(--cxc-shadow-sm)"
            },
            onDragEnter: allowAttachments ? handleDragEnter : void 0,
            onDragLeave: allowAttachments ? handleDragLeave : void 0,
            onDragOver: allowAttachments ? handleDragOver : void 0,
            onDrop: allowAttachments ? handleDrop : void 0,
            children: [
              isDragging && /* @__PURE__ */ jsxRuntime.jsx(
                "div",
                {
                  className: "absolute inset-0 z-10 flex items-center justify-center rounded-[20px]",
                  style: { backgroundColor: "var(--cxc-bg-overlay)" },
                  children: /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-sm font-medium", style: { color: "var(--cxc-text-inverse)" }, children: "Drop files here" })
                }
              ),
              attachments.length > 0 && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex flex-wrap gap-2 px-4 pt-3 pb-1", children: attachments.map((attachment) => /* @__PURE__ */ jsxRuntime.jsxs(
                "div",
                {
                  className: "flex items-center gap-2 px-3 py-2 rounded-[var(--cxc-radius-md)] text-sm",
                  style: {
                    backgroundColor: "var(--cxc-bg-muted)",
                    color: "var(--cxc-text-secondary)"
                  },
                  onClick: (e) => e.stopPropagation(),
                  children: [
                    /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Paperclip, { size: 14, style: { color: "var(--cxc-text-muted)" } }),
                    /* @__PURE__ */ jsxRuntime.jsx("span", { className: "truncate max-w-[120px]", children: attachment.name }),
                    /* @__PURE__ */ jsxRuntime.jsx(
                      "button",
                      {
                        type: "button",
                        onClick: () => removeAttachment(attachment.id),
                        className: "rounded-full p-1 transition-colors duration-100",
                        style: { color: "var(--cxc-text-muted)" },
                        onMouseOver: (e) => {
                          e.currentTarget.style.color = "var(--cxc-text)";
                          e.currentTarget.style.backgroundColor = "var(--cxc-bg-subtle)";
                        },
                        onMouseOut: (e) => {
                          e.currentTarget.style.color = "var(--cxc-text-muted)";
                          e.currentTarget.style.backgroundColor = "transparent";
                        },
                        "aria-label": `Remove ${attachment.name}`,
                        children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.X, { size: 14 })
                      }
                    )
                  ]
                },
                attachment.id
              )) }),
              /* @__PURE__ */ jsxRuntime.jsx(
                "div",
                {
                  className: cn("px-4 pb-1", attachments.length > 0 ? "pt-2" : "pt-3.5"),
                  onClick: () => textareaRef.current?.focus(),
                  children: /* @__PURE__ */ jsxRuntime.jsx(
                    "textarea",
                    {
                      ref: textareaRef,
                      value: inputValue,
                      onChange: handleChange,
                      onKeyDown: handleKeyDown,
                      placeholder: resolvedPlaceholder,
                      disabled: isDisabled || isStreaming,
                      rows: 1,
                      "aria-label": "Message input",
                      "aria-multiline": "true",
                      className: cn(
                        "w-full resize-none bg-transparent text-[15px] leading-6 outline-none",
                        "placeholder:text-[var(--cxc-text-muted)]",
                        "disabled:cursor-not-allowed disabled:opacity-50"
                      ),
                      style: {
                        color: "var(--cxc-text)",
                        fontFamily: "var(--cxc-font-sans)"
                      }
                    }
                  )
                }
              ),
              /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center justify-between px-3 pb-3 pt-1", children: [
                /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-1", children: [
                  allowAttachments && /* @__PURE__ */ jsxRuntime.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: handleFileClick,
                      className: cn(
                        "flex h-8 w-8 items-center justify-center",
                        "rounded-full",
                        "transition-colors duration-100",
                        "focus-visible:outline-none focus-visible:ring-2",
                        "focus-visible:ring-[var(--cxc-border-focus)]"
                      ),
                      style: {
                        color: "var(--cxc-text-secondary)",
                        border: "1px solid var(--cxc-border)"
                      },
                      onMouseOver: (e) => {
                        e.currentTarget.style.backgroundColor = "var(--cxc-bg-muted)";
                        e.currentTarget.style.color = "var(--cxc-text)";
                      },
                      onMouseOut: (e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "var(--cxc-text-secondary)";
                      },
                      "aria-label": "Attach files",
                      children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Plus, { size: 16, strokeWidth: 1.8 })
                    }
                  ),
                  addonSlot && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex items-center gap-1", children: addonSlot }),
                  allowAttachments && /* @__PURE__ */ jsxRuntime.jsx(
                    "input",
                    {
                      ref: fileInputRef,
                      type: "file",
                      multiple: true,
                      accept: acceptFileTypes,
                      onChange: handleFileChange,
                      className: "hidden",
                      "aria-hidden": "true"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { mode: "wait", children: /* @__PURE__ */ jsxRuntime.jsx(
                  react$1.motion.button,
                  {
                    initial: { scale: 0.85, opacity: 0 },
                    animate: { scale: 1, opacity: 1 },
                    exit: { scale: 0.85, opacity: 0 },
                    transition: { duration: 0.12, ease: "easeOut" },
                    onClick: handleSendClick,
                    disabled: !isStreaming && !canSend,
                    "aria-label": isStreaming ? "Stop generating" : "Send message",
                    className: cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      "transition-all duration-150",
                      "active:scale-[0.96]",
                      "disabled:cursor-not-allowed disabled:opacity-30"
                    ),
                    style: {
                      backgroundColor: isStreaming || canSend ? "var(--cxc-text)" : "var(--cxc-border)",
                      color: "var(--cxc-text-inverse)"
                    },
                    children: isStreaming ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Square, { size: 12, fill: "currentColor" }) : /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ArrowUp, { size: 18, strokeWidth: 2.5 })
                  },
                  isStreaming ? "stop" : "send"
                ) })
              ] })
            ]
          }
        ),
        showCharCount && /* @__PURE__ */ jsxRuntime.jsxs(
          "div",
          {
            className: "px-2 text-right text-xs",
            style: {
              color: isOverLimit ? "var(--cxc-error)" : "var(--cxc-text-muted)"
            },
            children: [
              inputValue.length.toLocaleString(),
              " / ",
              maxLength.toLocaleString()
            ]
          }
        )
      ]
    }
  );
}

// src/utils/format-time.ts
function formatRelativeTime(date) {
  const now = /* @__PURE__ */ new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1e3);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffSeconds < 60) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const day = date.getDate();
  if (date.getFullYear() !== now.getFullYear()) {
    return `${month} ${day}, ${date.getFullYear()}`;
  }
  return `${month} ${day}`;
}
function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete
}) {
  const [showDelete, setShowDelete] = react.useState(false);
  const handleDelete = react.useCallback(
    (e) => {
      e.stopPropagation();
      onDelete(session.id);
    },
    [onDelete, session.id]
  );
  const handleKeyDown = react.useCallback(
    (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDelete(session.id);
      }
    },
    [onDelete, session.id]
  );
  return /* @__PURE__ */ jsxRuntime.jsxs(
    react$1.motion.button,
    {
      layout: true,
      initial: { opacity: 0, x: -8 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -8, height: 0 },
      transition: { duration: 0.15, ease: "easeOut" },
      type: "button",
      onClick: () => onSelect(session.id),
      onKeyDown: handleKeyDown,
      onMouseEnter: () => setShowDelete(true),
      onMouseLeave: () => setShowDelete(false),
      onFocus: () => setShowDelete(true),
      onBlur: () => setShowDelete(false),
      className: cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left",
        "transition-colors duration-100",
        "focus-visible:outline-none focus-visible:ring-2"
      ),
      style: {
        backgroundColor: isActive ? "var(--cxc-sidebar-active)" : "transparent",
        color: "var(--cxc-text)"
      },
      onMouseOver: (e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "var(--cxc-sidebar-hover)";
        }
      },
      onMouseOut: (e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      },
      "aria-label": `Session: ${session.title}`,
      "aria-current": isActive ? "true" : void 0,
      children: [
        /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsxRuntime.jsx(
            "p",
            {
              className: "truncate text-sm font-medium",
              style: {
                color: isActive ? "var(--cxc-accent)" : "var(--cxc-text)"
              },
              children: session.title
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "mt-0.5 flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntime.jsx(
              "span",
              {
                className: "text-xs",
                style: { color: "var(--cxc-text-muted)" },
                children: formatRelativeTime(session.updatedAt)
              }
            ),
            session.messageCount > 0 && /* @__PURE__ */ jsxRuntime.jsxs(
              "span",
              {
                className: "flex items-center gap-0.5 text-xs",
                style: { color: "var(--cxc-text-muted)" },
                children: [
                  /* @__PURE__ */ jsxRuntime.jsx(lucideReact.MessageSquare, { size: 10 }),
                  session.messageCount
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { children: showDelete && /* @__PURE__ */ jsxRuntime.jsx(
          react$1.motion.span,
          {
            initial: { opacity: 0, scale: 0.8 },
            animate: { opacity: 1, scale: 1 },
            exit: { opacity: 0, scale: 0.8 },
            transition: { duration: 0.1 },
            role: "button",
            tabIndex: 0,
            onClick: handleDelete,
            onKeyDown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onDelete(session.id);
              }
            },
            className: cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded",
              "transition-colors duration-100",
              "focus-visible:outline-none focus-visible:ring-1"
            ),
            style: { color: "var(--cxc-text-muted)" },
            onMouseOver: (e) => {
              e.currentTarget.style.color = "var(--cxc-error)";
              e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--cxc-error) 12%, transparent)";
            },
            onMouseOut: (e) => {
              e.currentTarget.style.color = "var(--cxc-text-muted)";
              e.currentTarget.style.backgroundColor = "transparent";
            },
            "aria-label": `Delete session: ${session.title}`,
            children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Trash2, { size: 14 })
          }
        ) })
      ]
    }
  );
}
function SessionList({
  onSelectSession,
  onNewConversation,
  className
}) {
  const { state, loadSession, deleteSession, newConversation } = useChatContext();
  const { sessions, activeSessionId } = state;
  const listRef = react.useRef(null);
  const handleSelect = react.useCallback(
    (sessionId) => {
      onSelectSession?.(sessionId);
      loadSession(sessionId);
    },
    [onSelectSession, loadSession]
  );
  const handleDelete = react.useCallback(
    (sessionId) => {
      deleteSession(sessionId);
    },
    [deleteSession]
  );
  const handleNewChat = react.useCallback(() => {
    onNewConversation?.();
    newConversation();
  }, [onNewConversation, newConversation]);
  const handleListKeyDown = react.useCallback(
    (e) => {
      const items = listRef.current?.querySelectorAll(
        '[role="button"], button[aria-label^="Session"]'
      );
      if (!items?.length) return;
      const currentIndex = Array.from(items).findIndex(
        (item) => item === document.activeElement
      );
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[next].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prev].focus();
      }
    },
    []
  );
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "nav",
    {
      className: cn(
        "flex h-full flex-col",
        className
      ),
      style: {
        backgroundColor: "var(--cxc-sidebar-bg)",
        width: "var(--cxc-sidebar-width)"
      },
      "aria-label": "Chat sessions",
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            className: "shrink-0 p-3",
            style: { borderBottom: "1px solid var(--cxc-border-subtle)" },
            children: /* @__PURE__ */ jsxRuntime.jsxs(
              "button",
              {
                type: "button",
                onClick: handleNewChat,
                className: cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
                  "transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2"
                ),
                style: {
                  backgroundColor: "var(--cxc-accent)",
                  color: "var(--cxc-text-inverse)"
                },
                onMouseOver: (e) => {
                  e.currentTarget.style.backgroundColor = "var(--cxc-accent-hover)";
                },
                onMouseOut: (e) => {
                  e.currentTarget.style.backgroundColor = "var(--cxc-accent)";
                },
                "aria-label": "Start a new conversation",
                children: [
                  /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Plus, { size: 16 }),
                  "New Chat"
                ]
              }
            )
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            ref: listRef,
            className: "flex-1 overflow-y-auto cxc-scrollbar p-2",
            onKeyDown: handleListKeyDown,
            children: sessions.length === 0 ? (
              /* Empty state */
              /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-col items-center justify-center px-4 py-8", children: [
                /* @__PURE__ */ jsxRuntime.jsx(
                  lucideReact.MessageSquare,
                  {
                    size: 32,
                    style: { color: "var(--cxc-text-muted)" },
                    "aria-hidden": "true"
                  }
                ),
                /* @__PURE__ */ jsxRuntime.jsx(
                  "p",
                  {
                    className: "mt-3 text-sm text-center",
                    style: { color: "var(--cxc-text-muted)" },
                    children: "No previous conversations"
                  }
                )
              ] })
            ) : /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { initial: false, children: sessions.map((session) => /* @__PURE__ */ jsxRuntime.jsx(
              SessionItem,
              {
                session,
                isActive: session.id === activeSessionId,
                onSelect: handleSelect,
                onDelete: handleDelete
              },
              session.id
            )) })
          }
        )
      ]
    }
  );
}
function SessionSelector({ className }) {
  const { state, loadSession, newConversation, deleteSession } = useChatContext();
  const { sessions, activeSessionId } = state;
  const [isOpen, setIsOpen] = react.useState(false);
  const containerRef = react.useRef(null);
  const dropdownRef = react.useRef(null);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const buttonLabel = activeSession?.title ?? "New Chat";
  const toggle = react.useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);
  const close = react.useCallback(() => {
    setIsOpen(false);
  }, []);
  const handleSelectSession = react.useCallback(
    (sessionId) => {
      loadSession(sessionId);
      close();
    },
    [loadSession, close]
  );
  const handleDeleteSession = react.useCallback(
    (e, sessionId) => {
      e.stopPropagation();
      deleteSession(sessionId);
    },
    [deleteSession]
  );
  const handleNewChat = react.useCallback(() => {
    newConversation();
    close();
  }, [newConversation, close]);
  react.useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);
  const handleKeyDown = react.useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (!isOpen) {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }
      const items = dropdownRef.current?.querySelectorAll(
        "button[data-session-item]"
      );
      if (!items?.length) return;
      const currentIndex = Array.from(items).findIndex(
        (item) => item === document.activeElement
      );
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[next].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prev].focus();
      }
    },
    [isOpen, close]
  );
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      ref: containerRef,
      className: cn("relative", className),
      onKeyDown: handleKeyDown,
      children: [
        /* @__PURE__ */ jsxRuntime.jsxs(
          "button",
          {
            type: "button",
            onClick: toggle,
            className: cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
              "transition-colors duration-100",
              "focus-visible:outline-none focus-visible:ring-2"
            ),
            style: {
              backgroundColor: "var(--cxc-bg-subtle)",
              color: "var(--cxc-text)",
              border: "1px solid var(--cxc-border)"
            },
            "aria-haspopup": "listbox",
            "aria-expanded": isOpen,
            "aria-label": `Current session: ${buttonLabel}. Click to switch sessions.`,
            children: [
              /* @__PURE__ */ jsxRuntime.jsx("span", { className: "max-w-[180px] truncate", children: buttonLabel }),
              /* @__PURE__ */ jsxRuntime.jsx(
                react$1.motion.span,
                {
                  animate: { rotate: isOpen ? 180 : 0 },
                  transition: { duration: 0.2 },
                  children: /* @__PURE__ */ jsxRuntime.jsx(
                    lucideReact.ChevronDown,
                    {
                      size: 14,
                      style: { color: "var(--cxc-text-muted)" },
                      "aria-hidden": "true"
                    }
                  )
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { children: isOpen && /* @__PURE__ */ jsxRuntime.jsxs(
          react$1.motion.div,
          {
            ref: dropdownRef,
            initial: { opacity: 0, y: -4, scale: 0.98 },
            animate: { opacity: 1, y: 0, scale: 1 },
            exit: { opacity: 0, y: -4, scale: 0.98 },
            transition: { duration: 0.15, ease: "easeOut" },
            className: cn(
              "absolute left-0 top-full z-50 mt-1 w-64",
              "max-h-80 overflow-y-auto rounded-lg cxc-scrollbar"
            ),
            style: {
              backgroundColor: "var(--cxc-bg)",
              border: "1px solid var(--cxc-border)",
              boxShadow: "var(--cxc-shadow-lg)"
            },
            role: "listbox",
            "aria-label": "Chat sessions",
            children: [
              /* @__PURE__ */ jsxRuntime.jsxs(
                "button",
                {
                  type: "button",
                  "data-session-item": true,
                  onClick: handleNewChat,
                  className: cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-sm",
                    "transition-colors duration-100",
                    "focus-visible:outline-none focus-visible:bg-[var(--cxc-sidebar-hover)]"
                  ),
                  style: {
                    color: "var(--cxc-accent)",
                    borderBottom: "1px solid var(--cxc-border-subtle)"
                  },
                  onMouseOver: (e) => {
                    e.currentTarget.style.backgroundColor = "var(--cxc-sidebar-hover)";
                  },
                  onMouseOut: (e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  },
                  role: "option",
                  "aria-selected": !activeSessionId,
                  children: [
                    /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Plus, { size: 14 }),
                    /* @__PURE__ */ jsxRuntime.jsx("span", { className: "font-medium", children: "New Chat" })
                  ]
                }
              ),
              sessions.length === 0 ? /* @__PURE__ */ jsxRuntime.jsx(
                "div",
                {
                  className: "px-3 py-4 text-center text-sm",
                  style: { color: "var(--cxc-text-muted)" },
                  children: "No previous conversations"
                }
              ) : sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return /* @__PURE__ */ jsxRuntime.jsxs(
                  "button",
                  {
                    type: "button",
                    "data-session-item": true,
                    onClick: () => handleSelectSession(session.id),
                    className: cn(
                      "group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm",
                      "transition-colors duration-100",
                      "focus-visible:outline-none"
                    ),
                    style: {
                      backgroundColor: isActive ? "var(--cxc-sidebar-active)" : "transparent"
                    },
                    onMouseOver: (e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "var(--cxc-sidebar-hover)";
                      }
                    },
                    onMouseOut: (e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    },
                    role: "option",
                    "aria-selected": isActive,
                    children: [
                      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "min-w-0 flex-1", children: [
                        /* @__PURE__ */ jsxRuntime.jsx(
                          "p",
                          {
                            className: "truncate font-medium",
                            style: {
                              color: isActive ? "var(--cxc-accent)" : "var(--cxc-text)"
                            },
                            children: session.title
                          }
                        ),
                        /* @__PURE__ */ jsxRuntime.jsx(
                          "span",
                          {
                            className: "text-xs",
                            style: { color: "var(--cxc-text-muted)" },
                            children: formatRelativeTime(session.updatedAt)
                          }
                        )
                      ] }),
                      isActive && /* @__PURE__ */ jsxRuntime.jsx(
                        lucideReact.Check,
                        {
                          size: 14,
                          className: "shrink-0",
                          style: { color: "var(--cxc-accent)" },
                          "aria-hidden": "true"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntime.jsx(
                        "span",
                        {
                          role: "button",
                          tabIndex: 0,
                          onClick: (e) => handleDeleteSession(e, session.id),
                          onKeyDown: (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleDeleteSession(e, session.id);
                            }
                          },
                          className: cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded",
                            "opacity-0 transition-opacity duration-100",
                            "group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none"
                          ),
                          style: { color: "var(--cxc-text-muted)" },
                          onMouseOver: (e) => {
                            e.currentTarget.style.color = "var(--cxc-error)";
                            e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--cxc-error) 12%, transparent)";
                          },
                          onMouseOut: (e) => {
                            e.currentTarget.style.color = "var(--cxc-text-muted)";
                            e.currentTarget.style.backgroundColor = "transparent";
                          },
                          "aria-label": `Delete chat: ${session.title}`,
                          children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Trash2, { size: 13, "aria-hidden": "true" })
                        }
                      )
                    ]
                  },
                  session.id
                );
              })
            ]
          }
        ) })
      ]
    }
  );
}
function ChatContainer({
  showSessions = false,
  sessionPosition = "left",
  emptyState,
  className,
  headerSlot,
  inputAddonSlot,
  suggestions,
  onSuggestionClick,
  allowAttachments
}) {
  const { state } = useChatContext();
  const { messages } = state;
  const [sidebarOpen, setSidebarOpen] = react.useState(true);
  const toggleSidebar = react.useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);
  const hasMessages = messages.length > 0;
  const shouldShowSidebar = showSessions && sidebarOpen;
  const sidebarPanel = showSessions ? /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { mode: "wait", children: shouldShowSidebar && /* @__PURE__ */ jsxRuntime.jsx(
    react$1.motion.div,
    {
      initial: {
        opacity: 0,
        x: sessionPosition === "left" ? -20 : 20
      },
      animate: { opacity: 1, x: 0 },
      exit: {
        opacity: 0,
        x: sessionPosition === "left" ? -20 : 20
      },
      transition: { type: "spring", stiffness: 400, damping: 30 },
      className: "hidden h-full shrink-0 md:block",
      style: {
        borderRight: sessionPosition === "left" ? "1px solid var(--cxc-border-subtle)" : void 0,
        borderLeft: sessionPosition === "right" ? "1px solid var(--cxc-border-subtle)" : void 0
      },
      children: /* @__PURE__ */ jsxRuntime.jsx(SessionList, {})
    },
    "sidebar"
  ) }) : null;
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      className: cn(
        "cxc-root flex h-full w-full flex-col overflow-hidden",
        className
      ),
      style: {
        backgroundColor: "var(--cxc-bg)",
        fontFamily: "var(--cxc-font-sans)"
      },
      role: "region",
      "aria-label": "Chat",
      children: [
        (showSessions || headerSlot) && /* @__PURE__ */ jsxRuntime.jsxs(
          "div",
          {
            className: "flex shrink-0 items-center gap-2 px-4 py-2.5",
            style: {
              borderBottom: "1px solid var(--cxc-border-subtle)"
            },
            children: [
              showSessions && /* @__PURE__ */ jsxRuntime.jsx(
                "button",
                {
                  type: "button",
                  onClick: toggleSidebar,
                  className: cn(
                    "hidden md:flex h-8 w-8 items-center justify-center rounded-[var(--cxc-radius-md)]",
                    "transition-colors duration-100",
                    "focus-visible:outline-none focus-visible:ring-2"
                  ),
                  style: { color: "var(--cxc-text-muted)" },
                  onMouseOver: (e) => {
                    e.currentTarget.style.backgroundColor = "var(--cxc-bg-muted)";
                    e.currentTarget.style.color = "var(--cxc-text-secondary)";
                  },
                  onMouseOut: (e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--cxc-text-muted)";
                  },
                  "aria-label": sidebarOpen ? "Close session sidebar" : "Open session sidebar",
                  children: sidebarOpen ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.PanelLeftClose, { size: 18 }) : /* @__PURE__ */ jsxRuntime.jsx(lucideReact.PanelLeftOpen, { size: 18 })
                }
              ),
              showSessions && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "md:hidden", children: /* @__PURE__ */ jsxRuntime.jsx(SessionSelector, {}) }),
              /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex-1" }),
              headerSlot && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex items-center gap-2", children: headerSlot })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-1 min-h-0 overflow-hidden", children: [
          sessionPosition === "left" && sidebarPanel,
          /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-1 flex-col min-h-0 min-w-0", children: [
            hasMessages ? /* @__PURE__ */ jsxRuntime.jsx(MessageList, {}) : /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex flex-1 overflow-hidden", children: emptyState ?? /* @__PURE__ */ jsxRuntime.jsx(EmptyState, {}) }),
            /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "shrink-0 relative", style: { backgroundColor: "var(--cxc-bg)" }, children: [
              hasMessages && /* @__PURE__ */ jsxRuntime.jsx(
                "div",
                {
                  className: "absolute top-0 left-0 right-0 h-6 -translate-y-full pointer-events-none",
                  style: {
                    background: `linear-gradient(to bottom, transparent, var(--cxc-bg))`
                  },
                  "aria-hidden": "true"
                }
              ),
              /* @__PURE__ */ jsxRuntime.jsx("div", { className: "mx-auto", style: { maxWidth: "var(--cxc-content-max-width)" }, children: /* @__PURE__ */ jsxRuntime.jsx(
                PromptInput,
                {
                  addonSlot: inputAddonSlot,
                  suggestions: !hasMessages ? suggestions : void 0,
                  onSuggestionClick,
                  allowAttachments
                }
              ) })
            ] })
          ] }),
          sessionPosition === "right" && sidebarPanel
        ] })
      ]
    }
  );
}
function useStreamingText(fullText, options) {
  const { charsPerFrame = 2, enabled = true } = options ?? {};
  const [displayedText, setDisplayedText] = react.useState(enabled ? "" : fullText);
  const [isAnimating, setIsAnimating] = react.useState(false);
  const cursorRef = react.useRef(0);
  const rafRef = react.useRef(null);
  const fullTextRef = react.useRef(fullText);
  fullTextRef.current = fullText;
  const animate = react.useCallback(() => {
    const target = fullTextRef.current;
    if (cursorRef.current >= target.length) {
      setIsAnimating(false);
      rafRef.current = null;
      return;
    }
    cursorRef.current = Math.min(cursorRef.current + charsPerFrame, target.length);
    setDisplayedText(target.slice(0, cursorRef.current));
    rafRef.current = requestAnimationFrame(animate);
  }, [charsPerFrame]);
  react.useEffect(() => {
    if (!enabled) {
      cursorRef.current = fullText.length;
      setDisplayedText(fullText);
      setIsAnimating(false);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    if (fullText.length > cursorRef.current && rafRef.current === null) {
      setIsAnimating(true);
      rafRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [fullText, enabled, animate]);
  return {
    displayedText: enabled ? displayedText : fullText,
    isAnimating
  };
}
function StreamingText({
  text,
  charsPerFrame = 2,
  animate = true,
  onComplete,
  className
}) {
  const { displayedText, isAnimating } = useStreamingText(text, {
    charsPerFrame,
    enabled: animate
  });
  if (onComplete && !isAnimating && displayedText === text && animate) {
    queueMicrotask(onComplete);
  }
  return /* @__PURE__ */ jsxRuntime.jsxs("span", { className: cn("whitespace-pre-wrap", className), children: [
    displayedText,
    isAnimating && /* @__PURE__ */ jsxRuntime.jsx(
      "span",
      {
        className: "cxc-cursor inline-block w-0.5 align-text-bottom",
        style: {
          height: "1.1em",
          backgroundColor: "var(--cxc-text)",
          marginLeft: "1px"
        },
        "aria-hidden": "true"
      }
    )
  ] });
}
function StatusIcon({ status }) {
  switch (status) {
    case "completed":
      return /* @__PURE__ */ jsxRuntime.jsx(
        lucideReact.CheckCircle2,
        {
          size: 14,
          style: { color: "var(--cxc-success)" },
          "aria-hidden": "true"
        }
      );
    case "running":
      return /* @__PURE__ */ jsxRuntime.jsx(
        lucideReact.Clock,
        {
          size: 14,
          className: "cxc-thinking-pulse",
          style: { color: "var(--cxc-thinking-color)" },
          "aria-hidden": "true"
        }
      );
    case "error":
      return /* @__PURE__ */ jsxRuntime.jsx(
        lucideReact.AlertCircle,
        {
          size: 14,
          style: { color: "var(--cxc-error)" },
          "aria-hidden": "true"
        }
      );
    case "pending":
    default:
      return /* @__PURE__ */ jsxRuntime.jsx(
        lucideReact.Circle,
        {
          size: 14,
          style: { color: "var(--cxc-text-muted)" },
          "aria-hidden": "true"
        }
      );
  }
}
function ActionItem({
  action,
  depth = 0,
  isLast = false
}) {
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { paddingLeft: depth > 0 ? `${depth * 16}px` : void 0 }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2.5 py-2 relative", children: [
      !isLast && /* @__PURE__ */ jsxRuntime.jsx(
        "div",
        {
          className: "absolute left-[6px] top-[22px] bottom-0 w-px",
          style: { backgroundColor: "var(--cxc-action-line)" },
          "aria-hidden": "true"
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsx(
        "div",
        {
          className: "shrink-0 relative z-10 flex items-center justify-center",
          style: {
            /* Small bg circle behind icon to mask the line */
            backgroundColor: "var(--cxc-bg)"
          },
          children: /* @__PURE__ */ jsxRuntime.jsx(StatusIcon, { status: action.status })
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "span",
          {
            className: "text-[13px]",
            style: {
              color: action.status === "error" ? "var(--cxc-error)" : action.status === "running" ? "var(--cxc-text)" : "var(--cxc-text-secondary)"
            },
            children: action.label
          }
        ),
        action.detail && /* @__PURE__ */ jsxRuntime.jsx(
          "p",
          {
            className: "mt-0.5 text-xs truncate",
            style: { color: "var(--cxc-text-muted)" },
            title: action.detail,
            children: action.detail
          }
        )
      ] })
    ] }),
    action.children && action.children.length > 0 && /* @__PURE__ */ jsxRuntime.jsx(
      "div",
      {
        className: "ml-2",
        style: { borderLeft: "1px solid var(--cxc-action-line)" },
        children: action.children.map((child, i) => /* @__PURE__ */ jsxRuntime.jsx(
          ActionItem,
          {
            action: child,
            depth: depth + 1,
            isLast: i === action.children.length - 1
          },
          child.id
        ))
      }
    )
  ] });
}
function buildSummary2(actions) {
  const labelCounts = /* @__PURE__ */ new Map();
  for (const action of actions) {
    const label = action.label;
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  const parts = [];
  for (const [label, count] of labelCounts) {
    parts.push(count > 1 ? `${label} (${count}x)` : label);
  }
  return parts.join(", ");
}
function ActionIndicator({
  actions,
  isActive = false,
  className
}) {
  const [isExpanded, setIsExpanded] = react.useState(false);
  const showExpanded = isActive || isExpanded;
  const summary = react.useMemo(() => buildSummary2(actions), [actions]);
  const actionId = react.useMemo(
    () => `actions-${actions[0]?.id ?? "unknown"}`,
    [actions]
  );
  const handleToggle = react.useCallback(() => {
    if (!isActive) {
      setIsExpanded((prev) => !prev);
    }
  }, [isActive]);
  if (actions.length === 0) return null;
  const allCompleted = actions.every(
    (a) => a.status === "completed" || a.status === "error"
  );
  const hasErrors = actions.some((a) => a.status === "error");
  return /* @__PURE__ */ jsxRuntime.jsx(
    react$1.motion.div,
    {
      initial: { opacity: 0, height: 0 },
      animate: { opacity: 1, height: "auto" },
      exit: { opacity: 0, height: 0 },
      transition: { duration: 0.2, ease: "easeOut" },
      className: cn("overflow-hidden my-2", className),
      children: /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "overflow-hidden", children: [
        /* @__PURE__ */ jsxRuntime.jsxs(
          "button",
          {
            type: "button",
            onClick: handleToggle,
            className: cn(
              "flex items-center gap-2 w-full py-1.5 text-left",
              "transition-colors duration-150",
              !isActive && "cursor-pointer"
            ),
            style: {
              backgroundColor: "transparent"
            },
            "aria-expanded": showExpanded,
            "aria-controls": actionId,
            "aria-label": `Actions: ${summary}`,
            children: [
              isActive ? /* @__PURE__ */ jsxRuntime.jsx(
                lucideReact.Loader2,
                {
                  size: 13,
                  className: "cxc-spin shrink-0",
                  style: { color: "var(--cxc-thinking-color)" },
                  "aria-hidden": "true"
                }
              ) : allCompleted && !hasErrors ? /* @__PURE__ */ jsxRuntime.jsx(
                lucideReact.CheckCircle2,
                {
                  size: 13,
                  className: "shrink-0",
                  style: { color: "var(--cxc-success)" },
                  "aria-hidden": "true"
                }
              ) : hasErrors ? /* @__PURE__ */ jsxRuntime.jsx(
                lucideReact.AlertCircle,
                {
                  size: 13,
                  className: "shrink-0",
                  style: { color: "var(--cxc-error)" },
                  "aria-hidden": "true"
                }
              ) : null,
              /* @__PURE__ */ jsxRuntime.jsx(
                "span",
                {
                  className: "flex-1 text-[13px] truncate",
                  style: { color: "var(--cxc-text-muted)" },
                  children: summary
                }
              ),
              /* @__PURE__ */ jsxRuntime.jsx(
                react$1.motion.span,
                {
                  animate: { rotate: showExpanded ? 180 : 0 },
                  transition: { duration: 0.2 },
                  className: "shrink-0",
                  children: /* @__PURE__ */ jsxRuntime.jsx(
                    lucideReact.ChevronDown,
                    {
                      size: 13,
                      style: { color: "var(--cxc-text-muted)" },
                      "aria-hidden": "true"
                    }
                  )
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { initial: false, children: showExpanded && /* @__PURE__ */ jsxRuntime.jsx(
          react$1.motion.div,
          {
            id: actionId,
            role: "list",
            "aria-label": "Action details",
            initial: { height: 0, opacity: 0 },
            animate: { height: "auto", opacity: 1 },
            exit: { height: 0, opacity: 0 },
            transition: { duration: 0.2, ease: "easeOut" },
            className: "overflow-hidden",
            children: /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "pl-1 pb-1", children: [
              actions.map((action, i) => /* @__PURE__ */ jsxRuntime.jsx(
                ActionItem,
                {
                  action,
                  isLast: i === actions.length - 1
                },
                action.id
              )),
              allCompleted && !hasErrors && /* @__PURE__ */ jsxRuntime.jsxs(
                react$1.motion.div,
                {
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  transition: { delay: 0.1 },
                  className: "flex items-center gap-2 pt-1.5 pl-0.5",
                  children: [
                    /* @__PURE__ */ jsxRuntime.jsx(
                      lucideReact.CheckCircle2,
                      {
                        size: 12,
                        style: { color: "var(--cxc-success)" },
                        "aria-hidden": "true"
                      }
                    ),
                    /* @__PURE__ */ jsxRuntime.jsx(
                      "span",
                      {
                        className: "text-xs font-medium",
                        style: { color: "var(--cxc-success)" },
                        children: "Done"
                      }
                    )
                  ]
                }
              )
            ] })
          }
        ) })
      ] })
    }
  );
}
function ChatInput({
  placeholder,
  disabled,
  maxRows = 6,
  addonSlot,
  className
}) {
  const { state, config, send, stop, setInput } = useChatContext();
  const textareaRef = react.useRef(null);
  const resolvedPlaceholder = placeholder ?? config.placeholder ?? "Reply...";
  const maxLength = config.maxInputLength ?? 1e4;
  const isStreaming = state.isStreaming;
  const inputValue = state.inputValue;
  const isDisabled = disabled || false;
  const canSend = inputValue.trim().length > 0 && !isStreaming && !isDisabled;
  const showCharCount = inputValue.length > maxLength * 0.9;
  const isOverLimit = inputValue.length > maxLength;
  const adjustHeight = react.useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
    const maxHeight = lineHeight * maxRows;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [maxRows]);
  react.useEffect(() => {
    adjustHeight();
  }, [inputValue, adjustHeight]);
  react.useEffect(() => {
    if (config.autoFocus !== false) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [config.autoFocus]);
  const handleChange = react.useCallback(
    (e) => {
      setInput(e.target.value);
    },
    [setInput]
  );
  const handleKeyDown = react.useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canSend) {
          send(inputValue);
        }
      }
      if (e.key === "Escape" && isStreaming) {
        stop();
      }
    },
    [canSend, inputValue, isStreaming, send, stop]
  );
  const handleSendClick = react.useCallback(() => {
    if (isStreaming) {
      stop();
    } else if (canSend) {
      send(inputValue);
      textareaRef.current?.focus();
    }
  }, [isStreaming, canSend, inputValue, send, stop]);
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      className: cn(
        "relative mx-auto flex w-full flex-col gap-1 px-5 pb-4 pt-2 sm:px-8",
        className
      ),
      children: [
        /* @__PURE__ */ jsxRuntime.jsxs(
          "div",
          {
            className: "flex items-end gap-2 rounded-[var(--cxc-radius-xl)] px-4 py-3 transition-all duration-200",
            style: {
              backgroundColor: "var(--cxc-input-bg)",
              boxShadow: "var(--cxc-shadow-input)"
            },
            children: [
              addonSlot && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex shrink-0 items-center pb-0.5", children: addonSlot }),
              /* @__PURE__ */ jsxRuntime.jsx(
                "textarea",
                {
                  ref: textareaRef,
                  value: inputValue,
                  onChange: handleChange,
                  onKeyDown: handleKeyDown,
                  placeholder: resolvedPlaceholder,
                  disabled: isDisabled || isStreaming,
                  rows: 1,
                  "aria-label": "Message input",
                  "aria-multiline": "true",
                  className: cn(
                    "flex-1 resize-none bg-transparent text-[15px] leading-6 outline-none",
                    "placeholder:text-[var(--cxc-text-muted)]",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  ),
                  style: {
                    color: "var(--cxc-text)",
                    fontFamily: "var(--cxc-font-sans)"
                  }
                }
              ),
              /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { mode: "wait", children: /* @__PURE__ */ jsxRuntime.jsx(
                react$1.motion.button,
                {
                  initial: { scale: 0.8, opacity: 0 },
                  animate: { scale: 1, opacity: 1 },
                  exit: { scale: 0.8, opacity: 0 },
                  transition: { duration: 0.15, ease: "easeOut" },
                  onClick: handleSendClick,
                  disabled: !isStreaming && !canSend,
                  "aria-label": isStreaming ? "Stop generating" : "Send message",
                  className: cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    "transition-all duration-150",
                    "disabled:cursor-not-allowed disabled:opacity-25"
                  ),
                  style: {
                    backgroundColor: isStreaming || canSend ? "var(--cxc-text)" : "var(--cxc-border)",
                    color: "var(--cxc-text-inverse)"
                  },
                  children: isStreaming ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Square, { size: 12, fill: "currentColor" }) : /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ArrowUp, { size: 16, strokeWidth: 2.5 })
                },
                isStreaming ? "stop" : "send"
              ) })
            ]
          }
        ),
        showCharCount && /* @__PURE__ */ jsxRuntime.jsxs(
          "div",
          {
            className: "px-2 text-right text-xs",
            style: {
              color: isOverLimit ? "var(--cxc-error)" : "var(--cxc-text-muted)"
            },
            children: [
              inputValue.length.toLocaleString(),
              " / ",
              maxLength.toLocaleString()
            ]
          }
        )
      ]
    }
  );
}
function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  showCopy = true,
  maxHeight = "400px",
  className
}) {
  const [copied, setCopied] = react.useState(false);
  const timerRef = react.useRef(null);
  const handleCopy = react.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2e3);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2e3);
    }
  }, [code]);
  react.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
  const lines = code.split("\n");
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      className: cn(
        "overflow-hidden rounded-[var(--cxc-radius-lg)] my-4",
        className
      ),
      style: {
        backgroundColor: "var(--cxc-code-bg)"
      },
      children: [
        (language || showCopy) && /* @__PURE__ */ jsxRuntime.jsxs(
          "div",
          {
            className: "flex items-center justify-between px-4 py-2.5",
            style: {
              backgroundColor: "var(--cxc-code-header-bg)"
            },
            children: [
              /* @__PURE__ */ jsxRuntime.jsx(
                "span",
                {
                  className: "text-xs font-medium tracking-wide",
                  style: {
                    color: "var(--cxc-code-header-text)",
                    fontFamily: "var(--cxc-font-mono)"
                  },
                  children: language ?? ""
                }
              ),
              showCopy && /* @__PURE__ */ jsxRuntime.jsx(
                "button",
                {
                  type: "button",
                  onClick: handleCopy,
                  className: cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-[var(--cxc-radius-sm)] text-xs",
                    "transition-all duration-150",
                    "hover:opacity-80 focus-visible:outline-none focus-visible:ring-2"
                  ),
                  style: {
                    color: copied ? "var(--cxc-success)" : "var(--cxc-code-header-text)"
                  },
                  "aria-label": copied ? "Copied" : "Copy code",
                  children: copied ? /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Check, { size: 13 }),
                    /* @__PURE__ */ jsxRuntime.jsx("span", { children: "Copied!" })
                  ] }) : /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Copy, { size: 13 }),
                    /* @__PURE__ */ jsxRuntime.jsx("span", { children: "Copy" })
                  ] })
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            className: "overflow-auto cxc-scrollbar",
            style: { maxHeight },
            children: /* @__PURE__ */ jsxRuntime.jsx(
              "pre",
              {
                className: "px-4 py-4 m-0 text-[13px] leading-[1.65]",
                style: {
                  color: "var(--cxc-code-text)",
                  fontFamily: "var(--cxc-font-mono)",
                  tabSize: 2
                },
                children: /* @__PURE__ */ jsxRuntime.jsx("code", { children: showLineNumbers ? lines.map((line, i) => /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex", children: [
                  /* @__PURE__ */ jsxRuntime.jsx(
                    "span",
                    {
                      className: "select-none pr-4 text-right",
                      style: {
                        color: "var(--cxc-code-header-text)",
                        minWidth: `${String(lines.length).length + 1}ch`,
                        opacity: 0.6
                      },
                      "aria-hidden": "true",
                      children: i + 1
                    }
                  ),
                  /* @__PURE__ */ jsxRuntime.jsx("span", { className: "flex-1", children: line })
                ] }, i)) : code })
              }
            )
          }
        )
      ]
    }
  );
}
function ChatWidget({
  position = "bottom-right",
  defaultOpen = false,
  width = "420px",
  height = "600px",
  fabIcon,
  fabLabel,
  className,
  emptyState,
  inputAddonSlot,
  headerSlot
}) {
  const [isOpen, setIsOpen] = react.useState(defaultOpen);
  const [isExpanded, setIsExpanded] = react.useState(false);
  const [isTransitioning, setIsTransitioning] = react.useState(false);
  const { state } = useChatContext();
  const { messages } = state;
  const containerRef = react.useRef(null);
  const hasMessages = messages.length > 0;
  const isRight = position === "bottom-right";
  const close = react.useCallback(() => {
    setIsOpen(false);
    setIsExpanded(false);
  }, []);
  const toggle = react.useCallback(() => setIsOpen((prev) => !prev), []);
  const toggleExpand = react.useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setIsExpanded((prev) => !prev);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 120);
  }, []);
  react.useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        if (isExpanded) {
          setIsExpanded(false);
        } else {
          setIsOpen(false);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, isExpanded]);
  react.useEffect(() => {
    if (!isOpen || isExpanded) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [isOpen, isExpanded]);
  const panelStyle = isExpanded ? {
    bottom: "20px",
    left: "20px",
    right: "20px",
    top: "20px",
    width: "auto",
    height: "auto"
  } : {
    bottom: "20px",
    [isRight ? "right" : "left"]: "20px",
    width,
    height
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      ref: containerRef,
      className: cn(
        "fixed z-50",
        isRight ? "right-5 bottom-5" : "left-5 bottom-5",
        className
      ),
      style: { fontFamily: "var(--cxc-font-sans)" },
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { children: isOpen && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
          isExpanded && /* @__PURE__ */ jsxRuntime.jsx(
            react$1.motion.div,
            {
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              exit: { opacity: 0 },
              transition: { duration: 0.15 },
              className: "fixed inset-0 z-40",
              style: { backgroundColor: "rgba(0,0,0,0.5)" },
              "aria-hidden": "true"
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsx(
            react$1.motion.div,
            {
              initial: { opacity: 0, y: 12, scale: 0.97 },
              animate: {
                opacity: isTransitioning ? 0 : 1,
                y: 0,
                scale: 1
              },
              exit: { opacity: 0, y: 12, scale: 0.97 },
              transition: { duration: 0.15, ease: "easeOut" },
              className: "cxc-root cxc-compact fixed z-50 flex flex-col overflow-hidden rounded-[16px]",
              style: {
                backgroundColor: "var(--cxc-bg)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)",
                ...panelStyle
              },
              role: "dialog",
              "aria-label": "Chat assistant",
              "aria-modal": "true",
              children: /* @__PURE__ */ jsxRuntime.jsx(
                WidgetInner,
                {
                  hasMessages,
                  headerSlot,
                  emptyState,
                  inputAddonSlot,
                  close,
                  isExpanded,
                  toggleExpand
                }
              )
            }
          )
        ] }) }),
        /* @__PURE__ */ jsxRuntime.jsx(
          react$1.motion.button,
          {
            animate: {
              scale: isOpen ? 0 : 1,
              opacity: isOpen ? 0 : 1
            },
            transition: { duration: 0.15, ease: "easeOut" },
            onClick: toggle,
            className: cn(
              "flex h-14 w-14 items-center justify-center rounded-full",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              isOpen && "pointer-events-none"
            ),
            style: {
              backgroundColor: "var(--cxc-text)",
              color: "var(--cxc-text-inverse)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
            },
            "aria-label": fabLabel ?? "Open chat",
            title: fabLabel ?? "Open chat",
            tabIndex: isOpen ? -1 : 0,
            children: fabIcon ?? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.MessageCircle, { size: 24 })
          }
        )
      ]
    }
  );
}
function HeaderButton({
  onClick,
  label,
  children
}) {
  return /* @__PURE__ */ jsxRuntime.jsx(
    "button",
    {
      type: "button",
      onClick,
      className: cn(
        "flex h-7 w-7 items-center justify-center rounded-full",
        "transition-colors duration-100",
        "focus-visible:outline-none focus-visible:ring-2"
      ),
      style: { color: "var(--cxc-text-muted)" },
      onMouseOver: (e) => {
        e.currentTarget.style.backgroundColor = "var(--cxc-bg-muted)";
        e.currentTarget.style.color = "var(--cxc-text-secondary)";
      },
      onMouseOut: (e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = "var(--cxc-text-muted)";
      },
      "aria-label": label,
      title: label,
      children
    }
  );
}
function WidgetInner({
  hasMessages,
  headerSlot,
  emptyState,
  inputAddonSlot,
  close,
  isExpanded,
  toggleExpand
}) {
  return /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
    /* @__PURE__ */ jsxRuntime.jsxs(
      "div",
      {
        className: "flex shrink-0 items-center justify-between px-4 py-3",
        style: { borderBottom: "1px solid var(--cxc-border-subtle)" },
        children: [
          /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex items-center gap-2", children: headerSlot ?? /* @__PURE__ */ jsxRuntime.jsx(
            "span",
            {
              className: "text-sm font-medium",
              style: { color: "var(--cxc-text)" },
              children: "Chat"
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsxRuntime.jsx(
              HeaderButton,
              {
                onClick: toggleExpand,
                label: isExpanded ? "Collapse" : "Expand",
                children: isExpanded ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Minimize2, { size: 14 }) : /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Maximize2, { size: 14 })
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsx(HeaderButton, { onClick: close, label: "Close chat", children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.X, { size: 16 }) })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex flex-1 flex-col min-h-0", children: hasMessages ? /* @__PURE__ */ jsxRuntime.jsx(MessageList, {}) : /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex flex-1 overflow-hidden", children: emptyState ?? /* @__PURE__ */ jsxRuntime.jsx(EmptyState, {}) }) }),
    /* @__PURE__ */ jsxRuntime.jsx("div", { className: "shrink-0", children: /* @__PURE__ */ jsxRuntime.jsx(PromptInput, { addonSlot: inputAddonSlot }) })
  ] });
}
function ModeSwitch({ options, value, onChange, className }) {
  const containerRef = react.useRef(null);
  const buttonRefs = react.useRef(/* @__PURE__ */ new Map());
  const [indicatorStyle, setIndicatorStyle] = react.useState({ left: 0, width: 0 });
  const updateIndicator = react.useCallback(() => {
    const activeBtn = buttonRefs.current.get(value);
    const container = containerRef.current;
    if (!activeBtn || !container) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setIndicatorStyle({
      left: btnRect.left - containerRect.left,
      width: btnRect.width
    });
  }, [value]);
  react.useEffect(() => {
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      ref: containerRef,
      className: cn(
        "relative flex items-center gap-0.5 rounded-full p-[3px]",
        className
      ),
      style: {
        backgroundColor: "var(--cxc-bg-muted)"
      },
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          react$1.motion.div,
          {
            className: "absolute top-[3px] bottom-[3px] rounded-full",
            style: {
              backgroundColor: "var(--cxc-text)"
            },
            animate: {
              left: indicatorStyle.left,
              width: indicatorStyle.width
            },
            transition: {
              type: "spring",
              stiffness: 500,
              damping: 35,
              mass: 0.8
            }
          }
        ),
        options.map((option) => {
          const isActive = option.value === value;
          return /* @__PURE__ */ jsxRuntime.jsxs(
            "button",
            {
              ref: (el) => {
                if (el) buttonRefs.current.set(option.value, el);
              },
              type: "button",
              onClick: () => onChange(option.value),
              className: cn(
                "relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5",
                "text-xs font-medium transition-colors duration-150",
                "outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              ),
              style: {
                color: isActive ? "var(--cxc-text-inverse)" : "var(--cxc-text-muted)",
                fontFamily: "var(--cxc-font-sans)",
                letterSpacing: "var(--cxc-letter-spacing)"
              },
              "aria-pressed": isActive,
              children: [
                option.icon && /* @__PURE__ */ jsxRuntime.jsx("span", { className: "flex shrink-0 items-center", children: option.icon }),
                option.label
              ]
            },
            option.value
          );
        })
      ]
    }
  );
}

// src/hooks/use-chat.ts
function useChat() {
  const ctx = useChatContext();
  return {
    // State
    messages: ctx.state.messages,
    isStreaming: ctx.state.isStreaming,
    activeSessionId: ctx.state.activeSessionId,
    sessions: ctx.state.sessions,
    connectionStatus: ctx.state.connectionStatus,
    error: ctx.state.error,
    inputValue: ctx.state.inputValue,
    // Actions
    send: ctx.send,
    stop: ctx.stop,
    retry: ctx.retry,
    setInput: ctx.setInput,
    clearMessages: ctx.clearMessages,
    loadSession: ctx.loadSession,
    deleteSession: ctx.deleteSession,
    newConversation: ctx.newConversation
  };
}
function defaultBuildBody(message, sessionId) {
  return { message, session_id: sessionId };
}
function defaultParseEvent(eventType, data) {
  try {
    const parsed = JSON.parse(data);
    switch (eventType) {
      case "token":
        return { type: "token", text: String(parsed.text ?? "") };
      case "thinking":
        return { type: "thinking", active: parsed.active !== false };
      case "reasoning":
        return { type: "reasoning", text: String(parsed.text ?? "") };
      case "action":
        return {
          type: "action",
          action: {
            id: String(parsed.id ?? crypto.randomUUID()),
            type: String(parsed.action_type ?? parsed.type ?? "unknown"),
            label: String(parsed.label ?? ""),
            status: ["pending", "running", "completed", "error"].includes(String(parsed.status)) ? String(parsed.status) : "running",
            detail: parsed.detail != null ? String(parsed.detail) : void 0,
            timestamp: /* @__PURE__ */ new Date()
          }
        };
      case "action_update":
        return {
          type: "action_update",
          actionId: String(parsed.action_id ?? parsed.actionId ?? ""),
          status: parsed.status ?? "completed",
          detail: parsed.detail != null ? String(parsed.detail) : void 0
        };
      case "followups": {
        const opts = Array.isArray(parsed.options) ? parsed.options : [];
        return {
          type: "followups",
          followups: {
            label: String(parsed.label ?? ""),
            options: opts.map((o) => String(o)),
            multi: Boolean(parsed.multi ?? false)
          }
        };
      }
      case "ui_block": {
        const candidate = isValidViewSpec(parsed.spec) ? parsed.spec : parsed;
        if (isValidViewSpec(candidate)) {
          return { type: "ui_block", spec: candidate };
        }
        return null;
      }
      case "done":
        return {
          type: "done",
          sessionId: parsed.session_id != null ? String(parsed.session_id) : void 0,
          messageId: parsed.message_id != null ? String(parsed.message_id) : void 0
        };
      case "error":
        return {
          type: "error",
          message: String(parsed.message ?? parsed.error ?? "Unknown error"),
          code: parsed.code != null ? String(parsed.code) : void 0
        };
      default: {
        if (parsed.label || parsed.action_type) {
          return {
            type: "action",
            action: {
              id: String(parsed.id ?? crypto.randomUUID()),
              type: eventType,
              label: String(parsed.label ?? eventType),
              status: parsed.status ?? "running",
              detail: parsed.detail != null ? String(parsed.detail) : void 0,
              timestamp: /* @__PURE__ */ new Date()
            }
          };
        }
        if (typeof parsed.text === "string") {
          return { type: "token", text: parsed.text };
        }
        return null;
      }
    }
  } catch {
    if (data.trim()) {
      return { type: "token", text: data };
    }
    return null;
  }
}
function useSSEStream(config) {
  const {
    url,
    method = "POST",
    headers = {},
    buildBody = defaultBuildBody,
    parseEvent = defaultParseEvent
  } = config;
  const abortControllerRef = react.useRef(null);
  const sendFn = react.useCallback(
    async function* (message, sessionId, metadata) {
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      try {
        const fetchOptions = {
          method,
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...headers
          },
          signal: abortController.signal
        };
        if (method === "POST") {
          const body = buildBody(message, sessionId);
          const bodyWithMeta = metadata && typeof body === "object" && body !== null ? { ...body, ...metadata } : body;
          fetchOptions.body = JSON.stringify(bodyWithMeta);
        }
        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          yield {
            type: "error",
            message: `HTTP ${response.status}: ${errorText}`,
            code: String(response.status)
          };
          return;
        }
        if (!response.body) {
          yield { type: "error", message: "Response body is null" };
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEventType = "message";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed === "") {
                currentEventType = "message";
                continue;
              }
              if (trimmed.startsWith(":")) {
                continue;
              }
              if (trimmed.startsWith("event:")) {
                currentEventType = trimmed.slice(6).trim();
                continue;
              }
              if (trimmed.startsWith("data:")) {
                const data = trimmed.slice(5).trim();
                if (data === "[DONE]") {
                  yield { type: "done" };
                  return;
                }
                const event = parseEvent(currentEventType, data);
                if (event) {
                  yield event;
                  if (event.type === "done") {
                    return;
                  }
                }
              }
            }
          }
          if (buffer.trim()) {
            if (buffer.trim().startsWith("data:")) {
              const data = buffer.trim().slice(5).trim();
              if (data && data !== "[DONE]") {
                const event = parseEvent(currentEventType, data);
                if (event) {
                  yield event;
                }
              }
            }
          }
        } finally {
          reader.cancel().catch(() => {
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const message2 = err instanceof Error ? err.message : "Connection failed";
        yield { type: "error", message: message2 };
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [url, method, headers, buildBody, parseEvent]
  );
  return sendFn;
}
function useSessionManager(adapter) {
  const [sessions, setSessions] = react.useState([]);
  const [isLoading, setIsLoading] = react.useState(false);
  const [error, setError] = react.useState(null);
  const refresh = react.useCallback(async () => {
    if (!adapter) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await adapter.list();
      setSessions(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load sessions";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [adapter]);
  const deleteSession = react.useCallback(async (sessionId) => {
    if (!adapter?.delete) return;
    try {
      await adapter.delete(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete session";
      setError(message);
    }
  }, [adapter]);
  const renameSession = react.useCallback(async (sessionId, title) => {
    if (!adapter?.rename) return;
    try {
      await adapter.rename(sessionId, title);
      setSessions(
        (prev) => prev.map((s) => s.id === sessionId ? { ...s, title } : s)
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to rename session";
      setError(message);
    }
  }, [adapter]);
  react.useEffect(() => {
    refresh();
  }, [refresh]);
  return {
    sessions,
    isLoading,
    error,
    refresh,
    deleteSession,
    renameSession
  };
}

exports.ActionIndicator = ActionIndicator;
exports.AuiView = AuiView;
exports.ChainOfThought = ChainOfThought;
exports.ChatContainer = ChatContainer;
exports.ChatInput = ChatInput;
exports.ChatMessage = ChatMessage;
exports.ChatProvider = ChatProvider;
exports.ChatWidget = ChatWidget;
exports.CodeBlock = CodeBlock;
exports.EmptyState = EmptyState;
exports.FeedbackPopover = FeedbackPopover;
exports.FollowupsCard = FollowupsCard;
exports.MessageActionBar = MessageActionBar;
exports.MessageList = MessageList;
exports.ModeSwitch = ModeSwitch;
exports.PromptInput = PromptInput;
exports.SessionList = SessionList;
exports.SessionSelector = SessionSelector;
exports.StreamingText = StreamingText;
exports.TextShimmer = TextShimmer;
exports.ThinkingIndicator = ThinkingIndicator;
exports.cn = cn;
exports.formatRelativeTime = formatRelativeTime;
exports.isValidBlock = isValidBlock;
exports.isValidViewSpec = isValidViewSpec;
exports.renderMarkdown = renderMarkdown;
exports.useChat = useChat;
exports.useChatContext = useChatContext;
exports.useChatScroll = useChatScroll;
exports.useSSEStream = useSSEStream;
exports.useSessionManager = useSessionManager;
exports.useStreamingText = useStreamingText;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map