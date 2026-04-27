import { createContext, forwardRef, useCallback, useContext, useRef, useState, useEffect, useMemo, useReducer } from 'react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, Sparkles, ChevronDown, ThumbsUp, ThumbsDown, CheckCircle2, AlertCircle, Lock, Check, X, Circle, Clock, Copy, RotateCcw, Pencil, Paperclip, Plus, Square, ArrowUp, MessageSquare, PanelLeftClose, PanelLeftOpen, Loader2, MessageCircle, Minimize2, Maximize2, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// src/components/chat-provider.tsx
var ChatContext = createContext(null);
function useChatContext() {
  const ctx = useContext(ChatContext);
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
  const [state, dispatch] = useReducer(chatReducer, {
    ...initialChatState,
    messages: initialMessages ?? [],
    activeSessionId: initialSessionId
  });
  const generatorRef = useRef(null);
  const isStreamingRef = useRef(false);
  const config = useMemo(
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
  const send = useCallback(
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
  const stop = useCallback(() => {
    if (generatorRef.current) {
      generatorRef.current.return(void 0);
    }
  }, []);
  const retry = useCallback(
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
  const setInput = useCallback((value) => {
    dispatch({ type: "SET_INPUT", value });
  }, []);
  const clearMessages = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);
  const setMessages = useCallback((messages) => {
    dispatch({ type: "SET_MESSAGES", messages });
  }, []);
  const loadSession = useCallback(
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
  const deleteSession = useCallback(
    async (sessionId) => {
      if (!sessionAdapter?.delete) return;
      try {
        await sessionAdapter.delete(sessionId);
        dispatch({ type: "REMOVE_SESSION", sessionId });
      } catch {
      }
    },
    [sessionAdapter]
  );
  const newConversation = useCallback(() => {
    if (isStreamingRef.current) {
      stop();
    }
    dispatch({ type: "RESET" });
  }, [stop]);
  const selectFollowup = useCallback(
    (messageId, options) => {
      if (options.length === 0) return;
      dispatch({ type: "LOCK_FOLLOWUPS", messageId, selection: options });
      const text = options.join(", ");
      send(text);
    },
    [send]
  );
  const submitFeedback = useCallback(
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
  const removeFeedback = useCallback(
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
  const editAndRegenerate = useCallback(
    (newContent) => {
      const trimmed = newContent.trim();
      if (!trimmed) return;
      dispatch({ type: "TRIM_LAST_PAIR" });
      send(trimmed, { regenerate: true });
    },
    [send]
  );
  const regenerateLast = useCallback(() => {
    const lastUser = [...state.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    dispatch({ type: "TRIM_LAST_PAIR" });
    send(lastUser.content, { regenerate: true });
  }, [state.messages, send]);
  const contextValue = useMemo(
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
      selectFollowup,
      submitFeedback,
      removeFeedback,
      editAndRegenerate,
      regenerateLast
    ]
  );
  return /* @__PURE__ */ jsx(ChatContext.Provider, { value: contextValue, children });
}
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
function useChatScroll(deps) {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const isAtBottomRef = useRef(true);
  const scrollToBottom = useCallback((behavior = "smooth") => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior, block: "end" });
    }
    setUnreadCount(0);
    setIsAtBottom(true);
    isAtBottomRef.current = true;
  }, []);
  useEffect(() => {
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
  useEffect(() => {
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
  const Component = as ?? "span";
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
  return /* @__PURE__ */ jsx(
    Component,
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
      return /* @__PURE__ */ jsx(
        CheckCircle2,
        {
          size: 14,
          style: { color: "var(--cxc-success)" },
          "aria-hidden": "true"
        }
      );
    case "running":
      return /* @__PURE__ */ jsx(
        Clock,
        {
          size: 14,
          className: "cxc-thinking-pulse",
          style: { color: "var(--cxc-thinking-color)" },
          "aria-hidden": "true"
        }
      );
    case "error":
      return /* @__PURE__ */ jsx(
        AlertCircle,
        {
          size: 14,
          style: { color: "var(--cxc-error)" },
          "aria-hidden": "true"
        }
      );
    default:
      return /* @__PURE__ */ jsx(
        Circle,
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
  return /* @__PURE__ */ jsxs("div", { style: { paddingLeft: depth > 0 ? `${depth * 16}px` : void 0 }, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2.5 py-1.5 relative", children: [
      !isLast && /* @__PURE__ */ jsx(
        "div",
        {
          className: "absolute left-[6px] top-[20px] bottom-0 w-px",
          style: { backgroundColor: "var(--cxc-action-line)" },
          "aria-hidden": "true"
        }
      ),
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "shrink-0 relative z-10 flex items-center justify-center",
          style: { backgroundColor: "var(--cxc-bg)" },
          children: /* @__PURE__ */ jsx(StepIcon, { status: action.status })
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsx(
          "span",
          {
            className: "text-[13px]",
            style: {
              color: action.status === "error" ? "var(--cxc-error)" : action.status === "running" ? "var(--cxc-text)" : "var(--cxc-text-secondary)"
            },
            children: action.label
          }
        ),
        action.detail && /* @__PURE__ */ jsx(
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
    action.children && action.children.length > 0 && /* @__PURE__ */ jsx("div", { className: "ml-2", style: { borderLeft: "1px solid var(--cxc-action-line)" }, children: action.children.map((child, i) => /* @__PURE__ */ jsx(
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
  const [userToggled, setUserToggled] = useState(false);
  const [userWantsOpen, setUserWantsOpen] = useState(false);
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(0);
  const isExpanded = isActive ? !userToggled || userWantsOpen : userToggled && userWantsOpen;
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setContentHeight(el.scrollHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!isActive) {
      setUserToggled(false);
      setUserWantsOpen(false);
    }
  }, [isActive]);
  const handleToggle = useCallback(() => {
    setUserToggled(true);
    setUserWantsOpen((prev) => !prev);
  }, []);
  if (actions.length === 0) return null;
  const allDone = actions.every((a) => a.status === "completed" || a.status === "error");
  const hasErrors = actions.some((a) => a.status === "error");
  const summary = buildSummary(actions);
  return /* @__PURE__ */ jsxs("div", { className: cn("my-2", className), children: [
    /* @__PURE__ */ jsxs(
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
          isActive ? /* @__PURE__ */ jsxs(TextShimmer, { duration: 1.5, className: "text-[13px] font-medium flex-1 min-w-0", children: [
            thinkingLabel,
            "..."
          ] }) : allDone && !hasErrors ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 min-w-0 flex-1", children: [
            /* @__PURE__ */ jsx(
              CheckCircle2,
              {
                size: 13,
                className: "shrink-0",
                style: { color: "var(--cxc-success)" },
                "aria-hidden": "true"
              }
            ),
            /* @__PURE__ */ jsx(
              "span",
              {
                className: "text-[13px] truncate",
                style: { color: "var(--cxc-text-muted)" },
                children: summary
              }
            )
          ] }) : hasErrors ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 min-w-0 flex-1", children: [
            /* @__PURE__ */ jsx(
              AlertCircle,
              {
                size: 13,
                className: "shrink-0",
                style: { color: "var(--cxc-error)" },
                "aria-hidden": "true"
              }
            ),
            /* @__PURE__ */ jsx(
              "span",
              {
                className: "text-[13px] truncate",
                style: { color: "var(--cxc-text-muted)" },
                children: summary
              }
            )
          ] }) : /* @__PURE__ */ jsx(
            "span",
            {
              className: "text-[13px] truncate flex-1 min-w-0",
              style: { color: "var(--cxc-text-muted)" },
              children: summary
            }
          ),
          /* @__PURE__ */ jsx(
            ChevronDown,
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
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "overflow-hidden transition-all duration-300",
        style: {
          maxHeight: isExpanded ? `${contentHeight}px` : "0px",
          opacity: isExpanded ? 1 : 0,
          transitionTimingFunction: "var(--cxc-ease-accordion)"
        },
        children: /* @__PURE__ */ jsxs("div", { ref: contentRef, className: "pl-1 pb-1 pt-1", role: "list", "aria-label": "Action steps", children: [
          actions.map((action, i) => /* @__PURE__ */ jsx(
            Step,
            {
              action,
              isLast: i === actions.length - 1
            },
            action.id
          )),
          allDone && !hasErrors && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 pt-1.5 pl-0.5", children: [
            /* @__PURE__ */ jsx(
              CheckCircle2,
              {
                size: 12,
                style: { color: "var(--cxc-success)" },
                "aria-hidden": "true"
              }
            ),
            /* @__PURE__ */ jsx(
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
  return /* @__PURE__ */ jsx(AnimatePresence, { children: /* @__PURE__ */ jsx(
    motion.div,
    {
      role: "status",
      "aria-label": "AI is thinking",
      initial: { opacity: 0, y: 4 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -4 },
      transition: { duration: 0.2, ease: "easeOut" },
      className: cn("py-2", className),
      children: /* @__PURE__ */ jsxs(TextShimmer, { duration: 1.5, className: "text-[13px] font-medium", children: [
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
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
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
      icon: copied ? /* @__PURE__ */ jsx(Check, { size: 14 }) : /* @__PURE__ */ jsx(Copy, { size: 14 }),
      label: copied ? "Copied" : "Copy",
      onClick: handleCopy
    });
  }
  if (onRetry) {
    defaultActions.push({
      id: "retry",
      icon: /* @__PURE__ */ jsx(RotateCcw, { size: 14 }),
      label: "Retry",
      onClick: onRetry
    });
  }
  if (onEdit) {
    defaultActions.push({
      id: "edit",
      icon: /* @__PURE__ */ jsx(Pencil, { size: 14 }),
      label: "Edit",
      onClick: onEdit
    });
  }
  const allActions = [...defaultActions, ...actions ?? []];
  const showFeedback = Boolean(onFeedback);
  const currentRating = feedback?.rating ?? null;
  const handleUp = useCallback(() => {
    if (!onFeedback) return;
    onFeedback("up");
  }, [onFeedback]);
  const handleDown = useCallback(() => {
    if (!onFeedback) return;
    onFeedback("down");
  }, [onFeedback]);
  if (allActions.length === 0 && !showFeedback) return null;
  return /* @__PURE__ */ jsx("div", { className: "relative", children: /* @__PURE__ */ jsxs(
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
        allActions.map((action) => /* @__PURE__ */ jsx(
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
        showFeedback && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(
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
              children: /* @__PURE__ */ jsx(ThumbsUp, { size: 14, fill: currentRating === "up" ? "currentColor" : "none" })
            }
          ),
          /* @__PURE__ */ jsx(
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
              children: /* @__PURE__ */ jsx(ThumbsDown, { size: 14, fill: currentRating === "down" ? "currentColor" : "none" })
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
  const [checked, setChecked] = useState(/* @__PURE__ */ new Set());
  const [otherActive, setOtherActive] = useState(false);
  const [otherText, setOtherText] = useState("");
  const otherInputRef = useRef(null);
  useEffect(() => {
    if (otherActive && otherInputRef.current) {
      otherInputRef.current.focus();
    }
  }, [otherActive]);
  const lockedSet = useMemo(
    () => new Set(lockedSelection ?? []),
    [lockedSelection]
  );
  const submitSingle = useCallback(
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
  const toggleMulti = useCallback(
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
  const submitMulti = useCallback(() => {
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
  const submitOther = useCallback(() => {
    if (isLocked) return;
    const t = otherText.trim();
    if (!t) return;
    onSelect([t]);
  }, [isLocked, otherText, onSelect]);
  const hasMultiSelection = checked.size > 0 || otherActive && otherText.trim().length > 0;
  return /* @__PURE__ */ jsxs(
    motion.div,
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
        /* @__PURE__ */ jsxs("div", { className: "mb-2.5 flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsx(
            "p",
            {
              className: "text-[12px] font-medium tracking-wide uppercase",
              style: { color: "var(--cxc-text-muted)" },
              children: followups.label
            }
          ),
          isLocked && /* @__PURE__ */ jsxs(
            "span",
            {
              className: "inline-flex items-center gap-1 text-[11px] font-medium leading-none",
              style: { color: "var(--cxc-text-muted)" },
              children: [
                /* @__PURE__ */ jsx(Lock, { size: 11, strokeWidth: 2.2, className: "shrink-0 -mt-px" }),
                /* @__PURE__ */ jsx("span", { className: "leading-none", children: lockedSelection && lockedSelection.length > 0 ? "Selected" : "Closed" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1.5", children: followups.options.map((opt) => {
          const isOther = opt === OTHER_LABEL;
          const isChecked = followups.multi && checked.has(opt);
          const isLockedPick = lockedSet.has(opt);
          isLocked && !lockedSet.has(opt) && isOther === false && // If the locked selection has an item that isn't in options, that
          // was an Other-typed value — we render the OTHER_LABEL pill as
          // un-picked and surface the typed value as a separate locked pill below.
          false;
          return /* @__PURE__ */ jsxs(
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
                followups.multi && !isOther && /* @__PURE__ */ jsx(
                  "span",
                  {
                    "aria-hidden": true,
                    className: "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px]",
                    style: {
                      border: `1px solid ${isChecked ? "var(--cxc-text)" : "var(--cxc-border)"}`,
                      backgroundColor: isChecked ? "var(--cxc-text)" : "transparent"
                    },
                    children: isChecked && /* @__PURE__ */ jsx(Check, { size: 9, strokeWidth: 3, style: { color: "var(--cxc-bg)" } })
                  }
                ),
                /* @__PURE__ */ jsx("span", { children: opt })
              ]
            },
            opt
          );
        }) }),
        isLocked && lockedSelection && /* @__PURE__ */ jsx("div", { className: "mt-2 flex flex-wrap gap-1.5", children: lockedSelection.filter((s) => !followups.options.includes(s)).map((s) => /* @__PURE__ */ jsx(
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
        !isLocked && otherActive && /* @__PURE__ */ jsxs("div", { className: "mt-2.5 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(
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
          !followups.multi && /* @__PURE__ */ jsx(
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
        !isLocked && followups.multi && /* @__PURE__ */ jsx("div", { className: "mt-3 flex justify-end", children: /* @__PURE__ */ jsx(
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
  const [category, setCategory] = useState(void 0);
  const [text, setText] = useState("");
  const textareaRef = useRef(null);
  const containerRef = useRef(null);
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  useEffect(() => {
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
  return /* @__PURE__ */ jsxs(
    motion.div,
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
        /* @__PURE__ */ jsxs("div", { className: "mb-2 flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("p", { className: "text-[13px] font-medium", style: { color: "var(--cxc-text)" }, children: "What was wrong?" }),
          /* @__PURE__ */ jsx(
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
              children: /* @__PURE__ */ jsx(X, { size: 14 })
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "mb-2.5 flex flex-wrap gap-1", children: DOWN_REASONS.map((r) => {
          const active = category === r.value;
          return /* @__PURE__ */ jsx(
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
        /* @__PURE__ */ jsx(
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
        /* @__PURE__ */ jsxs("div", { className: "mt-2.5 flex justify-end gap-1.5", children: [
          /* @__PURE__ */ jsx(
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
          /* @__PURE__ */ jsx(
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
function ChatMessage({
  message,
  isStreaming = false,
  isLast = false,
  onRetry,
  className
}) {
  const { config, selectFollowup, submitFeedback, removeFeedback, editAndRegenerate, regenerateLast } = useChatContext();
  const [reasoningOpen, setReasoningOpen] = useState(isStreaming);
  const reasoningRef = useRef(null);
  const [reasoningHeight, setReasoningHeight] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const editTextareaRef = useRef(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const toggleReasoning = useCallback(() => {
    setReasoningOpen((prev) => !prev);
  }, []);
  useEffect(() => {
    const el = reasoningRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setReasoningHeight(el.scrollHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (editing && editTextareaRef.current) {
      editTextareaRef.current.focus();
      const len = editTextareaRef.current.value.length;
      editTextareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);
  const renderedContent = useMemo(() => {
    if (message.role === "user" || !message.content) return null;
    return renderMarkdown(message.content);
  }, [message.role, message.content]);
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const hasContent = message.content.length > 0;
  const hasActions = (message.actions?.length ?? 0) > 0;
  const hasReasoning = Boolean(message.reasoning);
  const hasFollowups = Boolean(message.followups);
  const showThinking = isStreaming && !hasContent && !hasActions;
  const enableEdit = isUser && isLast && config.enableRegenerate === true;
  const enableRegenButton = isAssistant && isLast && config.enableRegenerate === true && !isStreaming;
  const feedbackEnabled = isAssistant && Boolean(config.feedback) && Boolean(message.backendMessageId) && !isStreaming;
  const handleEditSubmit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setEditing(false);
    editAndRegenerate(trimmed);
  }, [editText, editAndRegenerate]);
  const handleEditCancel = useCallback(() => {
    setEditing(false);
    setEditText(message.content);
  }, [message.content]);
  const handleFeedbackClick = useCallback(
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
  return /* @__PURE__ */ jsx(
    motion.div,
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
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-2 w-full", children: [
          /* @__PURE__ */ jsx(
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
          /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-1.5", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: handleEditCancel,
                className: "rounded-full px-3 py-1.5 text-[13px]",
                style: { color: "var(--cxc-text-secondary)" },
                children: "Cancel"
              }
            ),
            /* @__PURE__ */ jsx(
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
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-end gap-1 max-w-[80%]", children: [
          /* @__PURE__ */ jsx(
            "div",
            {
              className: "rounded-[22px] px-5 py-3",
              style: {
                backgroundColor: "var(--cxc-user-bg)",
                color: "var(--cxc-user-text)",
                borderBottomRightRadius: "var(--cxc-radius-sm)"
              },
              children: /* @__PURE__ */ jsx("p", { className: "text-[15px] whitespace-pre-wrap break-words leading-[1.55]", children: message.content })
            }
          ),
          /* @__PURE__ */ jsx(
            MessageActionBar,
            {
              content: message.content,
              onEdit: enableEdit ? () => setEditing(true) : void 0
            }
          )
        ] })
      ) : isAssistant ? (
        /* === Assistant Message: Left-aligned, no bubble === */
        /* @__PURE__ */ jsxs("div", { className: "w-full", style: { color: "var(--cxc-assistant-text)" }, children: [
          hasReasoning && /* @__PURE__ */ jsxs(
            "div",
            {
              className: "mb-3 rounded-[var(--cxc-radius-md)] overflow-hidden",
              style: {
                backgroundColor: "var(--cxc-bg-subtle)",
                border: "1px solid var(--cxc-border-subtle)"
              },
              children: [
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    onClick: toggleReasoning,
                    className: "flex items-center gap-2 w-full px-3.5 py-2.5 text-left transition-colors duration-150",
                    "aria-expanded": reasoningOpen,
                    children: [
                      /* @__PURE__ */ jsx(
                        "span",
                        {
                          className: "text-xs font-medium tracking-wide uppercase",
                          style: { color: "var(--cxc-text-muted)" },
                          children: "Reasoning"
                        }
                      ),
                      /* @__PURE__ */ jsx(
                        ChevronDown,
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
                /* @__PURE__ */ jsx(
                  "div",
                  {
                    className: "overflow-hidden transition-all duration-300",
                    style: {
                      maxHeight: reasoningOpen ? `${reasoningHeight}px` : "0px",
                      opacity: reasoningOpen ? 1 : 0,
                      transitionTimingFunction: "var(--cxc-ease-accordion)"
                    },
                    children: /* @__PURE__ */ jsx(
                      "div",
                      {
                        ref: reasoningRef,
                        className: "px-3.5 pb-3 text-[13px]",
                        style: {
                          color: "var(--cxc-text-secondary)",
                          borderTop: "1px solid var(--cxc-border-subtle)"
                        },
                        children: /* @__PURE__ */ jsx("p", { className: "whitespace-pre-wrap leading-[1.65] pt-2.5", children: message.reasoning })
                      }
                    )
                  }
                )
              ]
            }
          ),
          hasActions && message.actions && /* @__PURE__ */ jsx(
            ChainOfThought,
            {
              actions: message.actions,
              isActive: isStreaming
            }
          ),
          showThinking && /* @__PURE__ */ jsx(ThinkingIndicator, {}),
          hasContent && renderedContent && /* @__PURE__ */ jsx(
            "div",
            {
              className: "cxc-markdown text-[15px] leading-[1.7]",
              dangerouslySetInnerHTML: { __html: renderedContent }
            }
          ),
          hasFollowups && message.followups && !isStreaming && /* @__PURE__ */ jsx(
            FollowupsCard,
            {
              followups: message.followups,
              lockedSelection: message.followupsSelection ?? (isLast ? void 0 : []),
              onSelect: (opts) => selectFollowup(message.id, opts)
            }
          ),
          message.error && /* @__PURE__ */ jsx(
            "div",
            {
              className: "flex items-center gap-2.5 mt-3 text-[13px]",
              role: "alert",
              children: /* @__PURE__ */ jsx("span", { style: { color: "var(--cxc-error)" }, children: message.content || "An error occurred" })
            }
          ),
          hasContent && !isStreaming && /* @__PURE__ */ jsxs("div", { className: "relative mt-1.5", children: [
            /* @__PURE__ */ jsx(
              MessageActionBar,
              {
                content: message.content,
                onRetry: message.error ? onRetry : enableRegenButton ? regenerateLast : void 0,
                feedback: feedbackEnabled ? message.feedback : null,
                onFeedback: feedbackEnabled ? handleFeedbackClick : void 0
              }
            ),
            feedbackOpen && feedbackEnabled && /* @__PURE__ */ jsx(
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
  return /* @__PURE__ */ jsxs(
    motion.div,
    {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
      className: cn(
        "flex flex-1 flex-col items-center justify-center px-6 py-16",
        className
      ),
      children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "mb-6",
            "aria-hidden": "true",
            children: icon ?? /* @__PURE__ */ jsx(
              Sparkles,
              {
                size: 32,
                strokeWidth: 1.5,
                style: { color: "var(--cxc-text-muted)" }
              }
            )
          }
        ),
        /* @__PURE__ */ jsx(
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
        /* @__PURE__ */ jsx(
          "p",
          {
            className: "mb-8 max-w-sm text-center text-[15px]",
            style: { color: "var(--cxc-text-muted)" },
            children: description
          }
        ),
        suggestions && suggestions.length > 0 && /* @__PURE__ */ jsx(
          "div",
          {
            className: "flex max-w-lg flex-wrap items-center justify-center gap-2.5",
            role: "list",
            "aria-label": "Suggested prompts",
            children: suggestions.map((suggestion, index) => /* @__PURE__ */ jsx(
              motion.button,
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
var MessageList = forwardRef(
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
    const handleScrollToBottom = useCallback(() => {
      scrollToBottom("smooth");
    }, [scrollToBottom]);
    const lastMessage = messages[messages.length - 1];
    isStreaming && lastMessage?.role === "assistant" && lastMessage.content === "" && !lastMessage.actions?.length;
    if (messages.length === 0) {
      return /* @__PURE__ */ jsx(
        "div",
        {
          ref,
          className: cn("flex flex-1 overflow-hidden", className),
          role: "log",
          "aria-label": "Messages",
          "aria-live": "polite",
          "aria-relevant": "additions",
          children: /* @__PURE__ */ jsx(EmptyState, {})
        }
      );
    }
    return /* @__PURE__ */ jsxs(
      "div",
      {
        ref,
        className: cn("relative flex flex-1 flex-col overflow-hidden", className),
        children: [
          /* @__PURE__ */ jsx(
            "div",
            {
              ref: scrollRef,
              className: "flex-1 overflow-y-auto overflow-x-hidden cxc-scrollbar",
              role: "log",
              "aria-label": "Messages",
              "aria-live": "polite",
              "aria-relevant": "additions",
              style: { scrollBehavior: "smooth" },
              children: /* @__PURE__ */ jsxs(
                "div",
                {
                  className: "mx-auto w-full px-5 py-6 sm:px-8",
                  style: { maxWidth: "var(--cxc-content-max-width)" },
                  children: [
                    /* @__PURE__ */ jsx(AnimatePresence, { initial: false, children: messages.map((message, index) => {
                      if (message.role === "assistant" && message.isStreaming && message.content === "" && !message.actions?.length) {
                        return /* @__PURE__ */ jsx("div", { className: "py-3", children: /* @__PURE__ */ jsx(ThinkingIndicator, {}) }, message.id);
                      }
                      if (renderMessage) {
                        return /* @__PURE__ */ jsx("div", { children: renderMessage(message, index) }, message.id);
                      }
                      return /* @__PURE__ */ jsx(
                        ChatMessage,
                        {
                          message,
                          isStreaming: message.isStreaming,
                          isLast: index === messages.length - 1
                        },
                        message.id
                      );
                    }) }),
                    /* @__PURE__ */ jsx("div", { ref: bottomRef, className: "h-px w-full", "aria-hidden": "true" })
                  ]
                }
              )
            }
          ),
          /* @__PURE__ */ jsx(AnimatePresence, { children: !isAtBottom && /* @__PURE__ */ jsxs(
            motion.button,
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
                /* @__PURE__ */ jsx(ArrowDown, { size: 14 }),
                unreadCount > 0 && /* @__PURE__ */ jsx(
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
          /* @__PURE__ */ jsx("div", { className: "sr-only", "aria-live": "polite", "aria-atomic": "false", children: lastMessage?.role === "assistant" && !lastMessage.isStreaming && lastMessage.content && /* @__PURE__ */ jsx("span", { children: "New message from assistant" }) })
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
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const resolvedPlaceholder = placeholder ?? config.placeholder ?? "Message...";
  const maxLength = config.maxInputLength ?? 1e4;
  const isStreaming = state.isStreaming;
  const inputValue = state.inputValue;
  const isDisabled = disabled || false;
  const canSend = inputValue.trim().length > 0 && !isStreaming && !isDisabled;
  const showCharCount = inputValue.length > maxLength * 0.9;
  const isOverLimit = inputValue.length > maxLength;
  const showSuggestions = suggestions && suggestions.length > 0 && !inputValue && !isStreaming;
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
    const maxByRows = lineHeight * maxRows;
    const limit = Math.min(maxByRows, maxHeight);
    textarea.style.height = `${Math.min(textarea.scrollHeight, limit)}px`;
  }, [maxRows, maxHeight]);
  useEffect(() => {
    adjustHeight();
  }, [inputValue, adjustHeight]);
  useEffect(() => {
    if (config.autoFocus !== false) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [config.autoFocus]);
  const handleChange = useCallback(
    (e) => setInput(e.target.value),
    [setInput]
  );
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canSend) send(inputValue);
      }
      if (e.key === "Escape" && isStreaming) stop();
    },
    [canSend, inputValue, isStreaming, send, stop]
  );
  const handleSendClick = useCallback(() => {
    if (isStreaming) {
      stop();
    } else if (canSend) {
      send(inputValue);
      textareaRef.current?.focus();
    }
  }, [isStreaming, canSend, inputValue, send, stop]);
  const addFiles = useCallback(
    (files) => {
      const newAttachments = Array.from(files).map(createFileAttachment);
      setAttachments((prev) => [...prev, ...newAttachments]);
      onFilesAttached?.(newAttachments);
    },
    [onFilesAttached]
  );
  const removeAttachment = useCallback((id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);
  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleFileChange = useCallback(
    (e) => {
      if (e.target.files?.length) {
        addFiles(e.target.files);
        e.target.value = "";
      }
    },
    [addFiles]
  );
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );
  const handleSuggestionClick = useCallback(
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
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: cn(
        "cxc-prompt-input-wrap relative mx-auto flex w-full flex-col gap-2 px-5 pb-4 pt-2 sm:px-8",
        className
      ),
      children: [
        /* @__PURE__ */ jsx(AnimatePresence, { children: showSuggestions && /* @__PURE__ */ jsx(
          motion.div,
          {
            initial: { opacity: 0, y: 8 },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: 8 },
            transition: { duration: 0.15 },
            className: "flex flex-wrap gap-2 pb-1",
            children: suggestions.map((suggestion) => /* @__PURE__ */ jsx(
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
        /* @__PURE__ */ jsxs(
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
              isDragging && /* @__PURE__ */ jsx(
                "div",
                {
                  className: "absolute inset-0 z-10 flex items-center justify-center rounded-[20px]",
                  style: { backgroundColor: "var(--cxc-bg-overlay)" },
                  children: /* @__PURE__ */ jsx("span", { className: "text-sm font-medium", style: { color: "var(--cxc-text-inverse)" }, children: "Drop files here" })
                }
              ),
              attachments.length > 0 && /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2 px-4 pt-3 pb-1", children: attachments.map((attachment) => /* @__PURE__ */ jsxs(
                "div",
                {
                  className: "flex items-center gap-2 px-3 py-2 rounded-[var(--cxc-radius-md)] text-sm",
                  style: {
                    backgroundColor: "var(--cxc-bg-muted)",
                    color: "var(--cxc-text-secondary)"
                  },
                  onClick: (e) => e.stopPropagation(),
                  children: [
                    /* @__PURE__ */ jsx(Paperclip, { size: 14, style: { color: "var(--cxc-text-muted)" } }),
                    /* @__PURE__ */ jsx("span", { className: "truncate max-w-[120px]", children: attachment.name }),
                    /* @__PURE__ */ jsx(
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
                        children: /* @__PURE__ */ jsx(X, { size: 14 })
                      }
                    )
                  ]
                },
                attachment.id
              )) }),
              /* @__PURE__ */ jsx(
                "div",
                {
                  className: cn("px-4 pb-1", attachments.length > 0 ? "pt-2" : "pt-3.5"),
                  onClick: () => textareaRef.current?.focus(),
                  children: /* @__PURE__ */ jsx(
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
              /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-3 pb-3 pt-1", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
                  allowAttachments && /* @__PURE__ */ jsx(
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
                      children: /* @__PURE__ */ jsx(Plus, { size: 16, strokeWidth: 1.8 })
                    }
                  ),
                  addonSlot && /* @__PURE__ */ jsx("div", { className: "flex items-center gap-1", children: addonSlot }),
                  allowAttachments && /* @__PURE__ */ jsx(
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
                /* @__PURE__ */ jsx(AnimatePresence, { mode: "wait", children: /* @__PURE__ */ jsx(
                  motion.button,
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
                    children: isStreaming ? /* @__PURE__ */ jsx(Square, { size: 12, fill: "currentColor" }) : /* @__PURE__ */ jsx(ArrowUp, { size: 18, strokeWidth: 2.5 })
                  },
                  isStreaming ? "stop" : "send"
                ) })
              ] })
            ]
          }
        ),
        showCharCount && /* @__PURE__ */ jsxs(
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
  const [showDelete, setShowDelete] = useState(false);
  const handleDelete = useCallback(
    (e) => {
      e.stopPropagation();
      onDelete(session.id);
    },
    [onDelete, session.id]
  );
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDelete(session.id);
      }
    },
    [onDelete, session.id]
  );
  return /* @__PURE__ */ jsxs(
    motion.button,
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
        /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsx(
            "p",
            {
              className: "truncate text-sm font-medium",
              style: {
                color: isActive ? "var(--cxc-accent)" : "var(--cxc-text)"
              },
              children: session.title
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "mt-0.5 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(
              "span",
              {
                className: "text-xs",
                style: { color: "var(--cxc-text-muted)" },
                children: formatRelativeTime(session.updatedAt)
              }
            ),
            session.messageCount > 0 && /* @__PURE__ */ jsxs(
              "span",
              {
                className: "flex items-center gap-0.5 text-xs",
                style: { color: "var(--cxc-text-muted)" },
                children: [
                  /* @__PURE__ */ jsx(MessageSquare, { size: 10 }),
                  session.messageCount
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx(AnimatePresence, { children: showDelete && /* @__PURE__ */ jsx(
          motion.span,
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
              "hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-1"
            ),
            style: { color: "var(--cxc-text-muted)" },
            onMouseOver: (e) => {
              e.currentTarget.style.color = "var(--cxc-error)";
            },
            onMouseOut: (e) => {
              e.currentTarget.style.color = "var(--cxc-text-muted)";
            },
            "aria-label": `Delete session: ${session.title}`,
            children: /* @__PURE__ */ jsx(Trash2, { size: 14 })
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
  const listRef = useRef(null);
  const handleSelect = useCallback(
    (sessionId) => {
      onSelectSession?.(sessionId);
      loadSession(sessionId);
    },
    [onSelectSession, loadSession]
  );
  const handleDelete = useCallback(
    (sessionId) => {
      deleteSession(sessionId);
    },
    [deleteSession]
  );
  const handleNewChat = useCallback(() => {
    onNewConversation?.();
    newConversation();
  }, [onNewConversation, newConversation]);
  const handleListKeyDown = useCallback(
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
  return /* @__PURE__ */ jsxs(
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
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "shrink-0 p-3",
            style: { borderBottom: "1px solid var(--cxc-border-subtle)" },
            children: /* @__PURE__ */ jsxs(
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
                  /* @__PURE__ */ jsx(Plus, { size: 16 }),
                  "New Chat"
                ]
              }
            )
          }
        ),
        /* @__PURE__ */ jsx(
          "div",
          {
            ref: listRef,
            className: "flex-1 overflow-y-auto cxc-scrollbar p-2",
            onKeyDown: handleListKeyDown,
            children: sessions.length === 0 ? (
              /* Empty state */
              /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center px-4 py-8", children: [
                /* @__PURE__ */ jsx(
                  MessageSquare,
                  {
                    size: 32,
                    style: { color: "var(--cxc-text-muted)" },
                    "aria-hidden": "true"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "p",
                  {
                    className: "mt-3 text-sm text-center",
                    style: { color: "var(--cxc-text-muted)" },
                    children: "No previous conversations"
                  }
                )
              ] })
            ) : /* @__PURE__ */ jsx(AnimatePresence, { initial: false, children: sessions.map((session) => /* @__PURE__ */ jsx(
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
  const { state, loadSession, newConversation } = useChatContext();
  const { sessions, activeSessionId } = state;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const buttonLabel = activeSession?.title ?? "New Chat";
  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);
  const handleSelectSession = useCallback(
    (sessionId) => {
      loadSession(sessionId);
      close();
    },
    [loadSession, close]
  );
  const handleNewChat = useCallback(() => {
    newConversation();
    close();
  }, [newConversation, close]);
  useEffect(() => {
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
  const handleKeyDown = useCallback(
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
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: containerRef,
      className: cn("relative", className),
      onKeyDown: handleKeyDown,
      children: [
        /* @__PURE__ */ jsxs(
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
              /* @__PURE__ */ jsx("span", { className: "max-w-[180px] truncate", children: buttonLabel }),
              /* @__PURE__ */ jsx(
                motion.span,
                {
                  animate: { rotate: isOpen ? 180 : 0 },
                  transition: { duration: 0.2 },
                  children: /* @__PURE__ */ jsx(
                    ChevronDown,
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
        /* @__PURE__ */ jsx(AnimatePresence, { children: isOpen && /* @__PURE__ */ jsxs(
          motion.div,
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
              /* @__PURE__ */ jsxs(
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
                    /* @__PURE__ */ jsx(Plus, { size: 14 }),
                    /* @__PURE__ */ jsx("span", { className: "font-medium", children: "New Chat" })
                  ]
                }
              ),
              sessions.length === 0 ? /* @__PURE__ */ jsx(
                "div",
                {
                  className: "px-3 py-4 text-center text-sm",
                  style: { color: "var(--cxc-text-muted)" },
                  children: "No previous conversations"
                }
              ) : sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    "data-session-item": true,
                    onClick: () => handleSelectSession(session.id),
                    className: cn(
                      "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm",
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
                      /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
                        /* @__PURE__ */ jsx(
                          "p",
                          {
                            className: "truncate font-medium",
                            style: {
                              color: isActive ? "var(--cxc-accent)" : "var(--cxc-text)"
                            },
                            children: session.title
                          }
                        ),
                        /* @__PURE__ */ jsx(
                          "span",
                          {
                            className: "text-xs",
                            style: { color: "var(--cxc-text-muted)" },
                            children: formatRelativeTime(session.updatedAt)
                          }
                        )
                      ] }),
                      isActive && /* @__PURE__ */ jsx(
                        Check,
                        {
                          size: 14,
                          className: "shrink-0",
                          style: { color: "var(--cxc-accent)" },
                          "aria-hidden": "true"
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);
  const hasMessages = messages.length > 0;
  const shouldShowSidebar = showSessions && sidebarOpen;
  const sidebarPanel = showSessions ? /* @__PURE__ */ jsx(AnimatePresence, { mode: "wait", children: shouldShowSidebar && /* @__PURE__ */ jsx(
    motion.div,
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
      children: /* @__PURE__ */ jsx(SessionList, {})
    },
    "sidebar"
  ) }) : null;
  return /* @__PURE__ */ jsxs(
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
        (showSessions || headerSlot) && /* @__PURE__ */ jsxs(
          "div",
          {
            className: "flex shrink-0 items-center gap-2 px-4 py-2.5",
            style: {
              borderBottom: "1px solid var(--cxc-border-subtle)"
            },
            children: [
              showSessions && /* @__PURE__ */ jsx(
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
                  children: sidebarOpen ? /* @__PURE__ */ jsx(PanelLeftClose, { size: 18 }) : /* @__PURE__ */ jsx(PanelLeftOpen, { size: 18 })
                }
              ),
              showSessions && /* @__PURE__ */ jsx("div", { className: "md:hidden", children: /* @__PURE__ */ jsx(SessionSelector, {}) }),
              /* @__PURE__ */ jsx("div", { className: "flex-1" }),
              headerSlot && /* @__PURE__ */ jsx("div", { className: "flex items-center gap-2", children: headerSlot })
            ]
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-1 min-h-0 overflow-hidden", children: [
          sessionPosition === "left" && sidebarPanel,
          /* @__PURE__ */ jsxs("div", { className: "flex flex-1 flex-col min-h-0 min-w-0", children: [
            hasMessages ? /* @__PURE__ */ jsx(MessageList, {}) : /* @__PURE__ */ jsx("div", { className: "flex flex-1 overflow-hidden", children: emptyState ?? /* @__PURE__ */ jsx(EmptyState, {}) }),
            /* @__PURE__ */ jsxs("div", { className: "shrink-0 relative", style: { backgroundColor: "var(--cxc-bg)" }, children: [
              hasMessages && /* @__PURE__ */ jsx(
                "div",
                {
                  className: "absolute top-0 left-0 right-0 h-6 -translate-y-full pointer-events-none",
                  style: {
                    background: `linear-gradient(to bottom, transparent, var(--cxc-bg))`
                  },
                  "aria-hidden": "true"
                }
              ),
              /* @__PURE__ */ jsx("div", { className: "mx-auto", style: { maxWidth: "var(--cxc-content-max-width)" }, children: /* @__PURE__ */ jsx(
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
  const [displayedText, setDisplayedText] = useState(enabled ? "" : fullText);
  const [isAnimating, setIsAnimating] = useState(false);
  const cursorRef = useRef(0);
  const rafRef = useRef(null);
  const fullTextRef = useRef(fullText);
  fullTextRef.current = fullText;
  const animate = useCallback(() => {
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
  useEffect(() => {
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
  return /* @__PURE__ */ jsxs("span", { className: cn("whitespace-pre-wrap", className), children: [
    displayedText,
    isAnimating && /* @__PURE__ */ jsx(
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
      return /* @__PURE__ */ jsx(
        CheckCircle2,
        {
          size: 14,
          style: { color: "var(--cxc-success)" },
          "aria-hidden": "true"
        }
      );
    case "running":
      return /* @__PURE__ */ jsx(
        Clock,
        {
          size: 14,
          className: "cxc-thinking-pulse",
          style: { color: "var(--cxc-thinking-color)" },
          "aria-hidden": "true"
        }
      );
    case "error":
      return /* @__PURE__ */ jsx(
        AlertCircle,
        {
          size: 14,
          style: { color: "var(--cxc-error)" },
          "aria-hidden": "true"
        }
      );
    case "pending":
    default:
      return /* @__PURE__ */ jsx(
        Circle,
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
  return /* @__PURE__ */ jsxs("div", { style: { paddingLeft: depth > 0 ? `${depth * 16}px` : void 0 }, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2.5 py-2 relative", children: [
      !isLast && /* @__PURE__ */ jsx(
        "div",
        {
          className: "absolute left-[6px] top-[22px] bottom-0 w-px",
          style: { backgroundColor: "var(--cxc-action-line)" },
          "aria-hidden": "true"
        }
      ),
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "shrink-0 relative z-10 flex items-center justify-center",
          style: {
            /* Small bg circle behind icon to mask the line */
            backgroundColor: "var(--cxc-bg)"
          },
          children: /* @__PURE__ */ jsx(StatusIcon, { status: action.status })
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsx(
          "span",
          {
            className: "text-[13px]",
            style: {
              color: action.status === "error" ? "var(--cxc-error)" : action.status === "running" ? "var(--cxc-text)" : "var(--cxc-text-secondary)"
            },
            children: action.label
          }
        ),
        action.detail && /* @__PURE__ */ jsx(
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
    action.children && action.children.length > 0 && /* @__PURE__ */ jsx(
      "div",
      {
        className: "ml-2",
        style: { borderLeft: "1px solid var(--cxc-action-line)" },
        children: action.children.map((child, i) => /* @__PURE__ */ jsx(
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
  const [isExpanded, setIsExpanded] = useState(false);
  const showExpanded = isActive || isExpanded;
  const summary = useMemo(() => buildSummary2(actions), [actions]);
  const actionId = useMemo(
    () => `actions-${actions[0]?.id ?? "unknown"}`,
    [actions]
  );
  const handleToggle = useCallback(() => {
    if (!isActive) {
      setIsExpanded((prev) => !prev);
    }
  }, [isActive]);
  if (actions.length === 0) return null;
  const allCompleted = actions.every(
    (a) => a.status === "completed" || a.status === "error"
  );
  const hasErrors = actions.some((a) => a.status === "error");
  return /* @__PURE__ */ jsx(
    motion.div,
    {
      initial: { opacity: 0, height: 0 },
      animate: { opacity: 1, height: "auto" },
      exit: { opacity: 0, height: 0 },
      transition: { duration: 0.2, ease: "easeOut" },
      className: cn("overflow-hidden my-2", className),
      children: /* @__PURE__ */ jsxs("div", { className: "overflow-hidden", children: [
        /* @__PURE__ */ jsxs(
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
              isActive ? /* @__PURE__ */ jsx(
                Loader2,
                {
                  size: 13,
                  className: "cxc-spin shrink-0",
                  style: { color: "var(--cxc-thinking-color)" },
                  "aria-hidden": "true"
                }
              ) : allCompleted && !hasErrors ? /* @__PURE__ */ jsx(
                CheckCircle2,
                {
                  size: 13,
                  className: "shrink-0",
                  style: { color: "var(--cxc-success)" },
                  "aria-hidden": "true"
                }
              ) : hasErrors ? /* @__PURE__ */ jsx(
                AlertCircle,
                {
                  size: 13,
                  className: "shrink-0",
                  style: { color: "var(--cxc-error)" },
                  "aria-hidden": "true"
                }
              ) : null,
              /* @__PURE__ */ jsx(
                "span",
                {
                  className: "flex-1 text-[13px] truncate",
                  style: { color: "var(--cxc-text-muted)" },
                  children: summary
                }
              ),
              /* @__PURE__ */ jsx(
                motion.span,
                {
                  animate: { rotate: showExpanded ? 180 : 0 },
                  transition: { duration: 0.2 },
                  className: "shrink-0",
                  children: /* @__PURE__ */ jsx(
                    ChevronDown,
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
        /* @__PURE__ */ jsx(AnimatePresence, { initial: false, children: showExpanded && /* @__PURE__ */ jsx(
          motion.div,
          {
            id: actionId,
            role: "list",
            "aria-label": "Action details",
            initial: { height: 0, opacity: 0 },
            animate: { height: "auto", opacity: 1 },
            exit: { height: 0, opacity: 0 },
            transition: { duration: 0.2, ease: "easeOut" },
            className: "overflow-hidden",
            children: /* @__PURE__ */ jsxs("div", { className: "pl-1 pb-1", children: [
              actions.map((action, i) => /* @__PURE__ */ jsx(
                ActionItem,
                {
                  action,
                  isLast: i === actions.length - 1
                },
                action.id
              )),
              allCompleted && !hasErrors && /* @__PURE__ */ jsxs(
                motion.div,
                {
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  transition: { delay: 0.1 },
                  className: "flex items-center gap-2 pt-1.5 pl-0.5",
                  children: [
                    /* @__PURE__ */ jsx(
                      CheckCircle2,
                      {
                        size: 12,
                        style: { color: "var(--cxc-success)" },
                        "aria-hidden": "true"
                      }
                    ),
                    /* @__PURE__ */ jsx(
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
  const textareaRef = useRef(null);
  const resolvedPlaceholder = placeholder ?? config.placeholder ?? "Reply...";
  const maxLength = config.maxInputLength ?? 1e4;
  const isStreaming = state.isStreaming;
  const inputValue = state.inputValue;
  const isDisabled = disabled || false;
  const canSend = inputValue.trim().length > 0 && !isStreaming && !isDisabled;
  const showCharCount = inputValue.length > maxLength * 0.9;
  const isOverLimit = inputValue.length > maxLength;
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
    const maxHeight = lineHeight * maxRows;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [maxRows]);
  useEffect(() => {
    adjustHeight();
  }, [inputValue, adjustHeight]);
  useEffect(() => {
    if (config.autoFocus !== false) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [config.autoFocus]);
  const handleChange = useCallback(
    (e) => {
      setInput(e.target.value);
    },
    [setInput]
  );
  const handleKeyDown = useCallback(
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
  const handleSendClick = useCallback(() => {
    if (isStreaming) {
      stop();
    } else if (canSend) {
      send(inputValue);
      textareaRef.current?.focus();
    }
  }, [isStreaming, canSend, inputValue, send, stop]);
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: cn(
        "relative mx-auto flex w-full flex-col gap-1 px-5 pb-4 pt-2 sm:px-8",
        className
      ),
      children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            className: "flex items-end gap-2 rounded-[var(--cxc-radius-xl)] px-4 py-3 transition-all duration-200",
            style: {
              backgroundColor: "var(--cxc-input-bg)",
              boxShadow: "var(--cxc-shadow-input)"
            },
            children: [
              addonSlot && /* @__PURE__ */ jsx("div", { className: "flex shrink-0 items-center pb-0.5", children: addonSlot }),
              /* @__PURE__ */ jsx(
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
              /* @__PURE__ */ jsx(AnimatePresence, { mode: "wait", children: /* @__PURE__ */ jsx(
                motion.button,
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
                  children: isStreaming ? /* @__PURE__ */ jsx(Square, { size: 12, fill: "currentColor" }) : /* @__PURE__ */ jsx(ArrowUp, { size: 16, strokeWidth: 2.5 })
                },
                isStreaming ? "stop" : "send"
              ) })
            ]
          }
        ),
        showCharCount && /* @__PURE__ */ jsxs(
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
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  const handleCopy = useCallback(async () => {
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
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
  const lines = code.split("\n");
  return /* @__PURE__ */ jsxs(
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
        (language || showCopy) && /* @__PURE__ */ jsxs(
          "div",
          {
            className: "flex items-center justify-between px-4 py-2.5",
            style: {
              backgroundColor: "var(--cxc-code-header-bg)"
            },
            children: [
              /* @__PURE__ */ jsx(
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
              showCopy && /* @__PURE__ */ jsx(
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
                  children: copied ? /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsx(Check, { size: 13 }),
                    /* @__PURE__ */ jsx("span", { children: "Copied!" })
                  ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsx(Copy, { size: 13 }),
                    /* @__PURE__ */ jsx("span", { children: "Copy" })
                  ] })
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "overflow-auto cxc-scrollbar",
            style: { maxHeight },
            children: /* @__PURE__ */ jsx(
              "pre",
              {
                className: "px-4 py-4 m-0 text-[13px] leading-[1.65]",
                style: {
                  color: "var(--cxc-code-text)",
                  fontFamily: "var(--cxc-font-mono)",
                  tabSize: 2
                },
                children: /* @__PURE__ */ jsx("code", { children: showLineNumbers ? lines.map((line, i) => /* @__PURE__ */ jsxs("div", { className: "flex", children: [
                  /* @__PURE__ */ jsx(
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
                  /* @__PURE__ */ jsx("span", { className: "flex-1", children: line })
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
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { state } = useChatContext();
  const { messages } = state;
  const containerRef = useRef(null);
  const hasMessages = messages.length > 0;
  const isRight = position === "bottom-right";
  const close = useCallback(() => {
    setIsOpen(false);
    setIsExpanded(false);
  }, []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const toggleExpand = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setIsExpanded((prev) => !prev);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 120);
  }, []);
  useEffect(() => {
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
  useEffect(() => {
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
  return /* @__PURE__ */ jsxs(
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
        /* @__PURE__ */ jsx(AnimatePresence, { children: isOpen && /* @__PURE__ */ jsxs(Fragment, { children: [
          isExpanded && /* @__PURE__ */ jsx(
            motion.div,
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
          /* @__PURE__ */ jsx(
            motion.div,
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
              children: /* @__PURE__ */ jsx(
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
        /* @__PURE__ */ jsx(
          motion.button,
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
            children: fabIcon ?? /* @__PURE__ */ jsx(MessageCircle, { size: 24 })
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
  return /* @__PURE__ */ jsx(
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
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: "flex shrink-0 items-center justify-between px-4 py-3",
        style: { borderBottom: "1px solid var(--cxc-border-subtle)" },
        children: [
          /* @__PURE__ */ jsx("div", { className: "flex items-center gap-2", children: headerSlot ?? /* @__PURE__ */ jsx(
            "span",
            {
              className: "text-sm font-medium",
              style: { color: "var(--cxc-text)" },
              children: "Chat"
            }
          ) }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsx(
              HeaderButton,
              {
                onClick: toggleExpand,
                label: isExpanded ? "Collapse" : "Expand",
                children: isExpanded ? /* @__PURE__ */ jsx(Minimize2, { size: 14 }) : /* @__PURE__ */ jsx(Maximize2, { size: 14 })
              }
            ),
            /* @__PURE__ */ jsx(HeaderButton, { onClick: close, label: "Close chat", children: /* @__PURE__ */ jsx(X, { size: 16 }) })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "flex flex-1 flex-col min-h-0", children: hasMessages ? /* @__PURE__ */ jsx(MessageList, {}) : /* @__PURE__ */ jsx("div", { className: "flex flex-1 overflow-hidden", children: emptyState ?? /* @__PURE__ */ jsx(EmptyState, {}) }) }),
    /* @__PURE__ */ jsx("div", { className: "shrink-0", children: /* @__PURE__ */ jsx(PromptInput, { addonSlot: inputAddonSlot }) })
  ] });
}
function ModeSwitch({ options, value, onChange, className }) {
  const containerRef = useRef(null);
  const buttonRefs = useRef(/* @__PURE__ */ new Map());
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const updateIndicator = useCallback(() => {
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
  useEffect(() => {
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);
  return /* @__PURE__ */ jsxs(
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
        /* @__PURE__ */ jsx(
          motion.div,
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
          return /* @__PURE__ */ jsxs(
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
                option.icon && /* @__PURE__ */ jsx("span", { className: "flex shrink-0 items-center", children: option.icon }),
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
  const abortControllerRef = useRef(null);
  const sendFn = useCallback(
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
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const refresh = useCallback(async () => {
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
  const deleteSession = useCallback(async (sessionId) => {
    if (!adapter?.delete) return;
    try {
      await adapter.delete(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete session";
      setError(message);
    }
  }, [adapter]);
  const renameSession = useCallback(async (sessionId, title) => {
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
  useEffect(() => {
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

export { ActionIndicator, ChainOfThought, ChatContainer, ChatInput, ChatMessage, ChatProvider, ChatWidget, CodeBlock, EmptyState, FeedbackPopover, FollowupsCard, MessageActionBar, MessageList, ModeSwitch, PromptInput, SessionList, SessionSelector, StreamingText, TextShimmer, ThinkingIndicator, cn, formatRelativeTime, renderMarkdown, useChat, useChatContext, useChatScroll, useSSEStream, useSessionManager, useStreamingText };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map