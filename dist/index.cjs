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

// src/utils/voice.ts
var VOICE_MIME_PREFERENCE = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4"
];
function pickMimeType(isSupported) {
  if (!isSupported) return void 0;
  return VOICE_MIME_PREFERENCE.find((type) => isSupported(type));
}
function getMimeSupportProbe() {
  if (typeof MediaRecorder === "undefined") return void 0;
  return (type) => MediaRecorder.isTypeSupported(type);
}
var MAX_RECORDING_SECONDS = 58;
function remainingSeconds(elapsed) {
  return Math.max(0, MAX_RECORDING_SECONDS - Math.floor(elapsed));
}
function formatDuration(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}
var ObjectUrlCache = class {
  constructor(capacity = 20, revoke = defaultRevoke) {
    this.capacity = capacity;
    this.revoke = revoke;
    this.urls = /* @__PURE__ */ new Map();
  }
  get size() {
    return this.urls.size;
  }
  get(key) {
    return this.urls.get(key);
  }
  /** Store a URL, revoking any URL it displaces and evicting past capacity. */
  set(key, url) {
    const previous = this.urls.get(key);
    if (previous !== void 0) {
      if (previous === url) return;
      this.revoke(previous);
    }
    this.urls.set(key, url);
    while (this.urls.size > this.capacity) {
      const oldest = this.urls.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
  }
  delete(key) {
    const url = this.urls.get(key);
    if (url === void 0) return;
    this.urls.delete(key);
    this.revoke(url);
  }
  /** Revoke every URL and empty the cache. Call on provider unmount. */
  clear() {
    for (const url of this.urls.values()) this.revoke(url);
    this.urls.clear();
  }
};
function defaultRevoke(url) {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

// src/utils/language.ts
var MAX_COMPACT_LABEL_CHARS = 8;
function foldForSearch(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
var nativeNameCache = /* @__PURE__ */ new Map();
function nativeLanguageName(locale, languageCode) {
  const key = `${locale}|${languageCode}`;
  const cached = nativeNameCache.get(key);
  if (cached !== void 0) return cached;
  let resolved = null;
  if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
    try {
      const name = new Intl.DisplayNames([locale], { type: "language" }).of(languageCode);
      if (name && name.toLowerCase() !== languageCode.toLowerCase()) resolved = name;
    } catch {
      resolved = null;
    }
  }
  nativeNameCache.set(key, resolved);
  return resolved;
}
function buildLanguageOptions(locales) {
  const options = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of locales ?? []) {
    const locale = typeof entry?.locale === "string" ? entry.locale.trim() : "";
    if (!locale) continue;
    const key = locale.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const declaredCode = typeof entry.language_code === "string" ? entry.language_code.trim() : "";
    const languageCode = (declaredCode || locale.split("-", 1)[0]).toLowerCase();
    const declaredName = typeof entry.locale_name === "string" ? entry.locale_name.trim() : "";
    const englishName = declaredName || locale;
    const nativeName = nativeLanguageName(locale, languageCode) ?? englishName;
    options.push({
      locale,
      languageCode,
      englishName,
      nativeName,
      search: {
        locale: foldForSearch(locale),
        code: foldForSearch(languageCode),
        english: foldForSearch(englishName),
        native: foldForSearch(nativeName)
      }
    });
  }
  return options;
}
function findOption(options, locale) {
  if (!locale) return void 0;
  const wanted = locale.trim().toLowerCase();
  if (!wanted) return void 0;
  return options.find((option) => option.locale.toLowerCase() === wanted);
}
function scoreOption(option, needle) {
  const { locale, code, english, native } = option.search;
  if (locale === needle || code === needle) return 4;
  if (locale.startsWith(needle) || code.startsWith(needle)) return 3;
  if (native.startsWith(needle) || english.startsWith(needle)) return 2;
  if (native.includes(needle) || english.includes(needle) || locale.includes(needle)) return 1;
  return 0;
}
function filterLanguages(options, query) {
  const needle = foldForSearch(query.trim());
  if (!needle) return [...options];
  return options.map((option, index) => ({ option, index, score: scoreOption(option, needle) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map((entry) => entry.option);
}
function matchesAutodetect(query) {
  const needle = foldForSearch(query.trim());
  if (!needle) return true;
  return "auto-detect automatic detect".includes(needle);
}
function frequentOptions(options, candidates) {
  const picked = [];
  const seen = /* @__PURE__ */ new Set();
  for (const candidate of candidates ?? []) {
    const option = findOption(options, candidate);
    if (!option || seen.has(option.locale)) continue;
    seen.add(option.locale);
    picked.push(option);
  }
  return picked;
}
function defaultLanguage(candidates, options) {
  for (const candidate of candidates ?? []) {
    const option = findOption(options, candidate);
    if (option) return option.locale;
  }
  const raw = (candidates ?? []).find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0
  );
  if (raw) return raw.trim();
  return options[0]?.locale ?? null;
}
var RESTING_DICTATION = {
  language: null,
  autodetectAvailable: true,
  explicit: false
};
function syncWithStatus(state, status, options) {
  const autodetectAvailable = state.autodetectAvailable && status?.stt_autodetect_available !== false;
  const keepsChoice = state.explicit && (state.language !== null || autodetectAvailable);
  const language = keepsChoice ? state.language : autodetectAvailable ? null : defaultLanguage(status?.autodetect_candidates, options);
  if (language === state.language && autodetectAvailable === state.autodetectAvailable) {
    return state;
  }
  return { language, autodetectAvailable, explicit: state.explicit };
}
function initialDictationState(status, options) {
  return syncWithStatus(RESTING_DICTATION, status, options);
}
function selectLanguage(state, language) {
  if (state.language === language && state.explicit) return state;
  return { ...state, language, explicit: true };
}
function learnFromTranscription(state, sentLanguage, result, options, candidates) {
  if (sentLanguage !== null) return state;
  if (result?.mode !== "forced") return state;
  if (!state.autodetectAvailable) return state;
  const used = findOption(options, result.language);
  return {
    language: used?.locale ?? defaultLanguage(candidates, options),
    autodetectAvailable: false,
    explicit: state.explicit
  };
}
function compactLabel(option) {
  return option.nativeName.length <= MAX_COMPACT_LABEL_CHARS ? option.nativeName : option.languageCode.toUpperCase();
}
function secondaryLabel(option) {
  const { englishName, nativeName } = option;
  if (!englishName.startsWith(nativeName)) return englishName;
  const remainder = englishName.slice(nativeName.length).trim();
  return remainder.replace(/^\(|\)$/g, "").trim();
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
  voice,
  voiceStatus,
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
      voice,
      voiceStatus,
      enableRegenerate
    }),
    [onSend, sessionAdapter, initialMessages, initialSessionId, maxInputLength, placeholder, autoFocus, actionLabels, feedback, voice, voiceStatus, enableRegenerate]
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
  const [speech, setSpeech] = react.useState({ messageId: null, status: "idle" });
  const audioRef = react.useRef(null);
  const audioUrlsRef = react.useRef(null);
  const speechRequestRef = react.useRef(null);
  const getAudioElement = react.useCallback(() => {
    if (typeof Audio === "undefined") return null;
    if (!audioRef.current) {
      const audio = new Audio();
      audio.onended = () => setSpeech({ messageId: null, status: "idle" });
      audio.onerror = () => {
        const pending = speechRequestRef.current;
        if (!pending) return;
        setSpeech({ messageId: pending, status: "error", error: "Playback failed" });
      };
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);
  const stopSpeech = react.useCallback(() => {
    speechRequestRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setSpeech({ messageId: null, status: "idle" });
  }, []);
  react.useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        audio.removeAttribute("src");
        audioRef.current = null;
      }
      audioUrlsRef.current?.clear();
      audioUrlsRef.current = null;
    };
  }, []);
  const toggleSpeech = react.useCallback(
    (messageId) => {
      if (!voice) return;
      if (speech.messageId === messageId && (speech.status === "playing" || speech.status === "loading")) {
        stopSpeech();
        return;
      }
      const msg = state.messages.find((m) => m.id === messageId);
      const backendId = msg?.backendMessageId;
      if (!backendId) return;
      const audio = getAudioElement();
      if (!audio) {
        setSpeech({ messageId, status: "error", error: "Audio playback is unavailable" });
        return;
      }
      audio.pause();
      speechRequestRef.current = messageId;
      const play = (url) => {
        audio.src = url;
        void audio.play().then(() => {
          if (speechRequestRef.current !== messageId) return;
          setSpeech({ messageId, status: "playing" });
        }).catch(() => {
          if (speechRequestRef.current !== messageId) return;
          setSpeech({ messageId, status: "error", error: "Playback failed" });
        });
      };
      if (!audioUrlsRef.current) audioUrlsRef.current = new ObjectUrlCache();
      const cached = audioUrlsRef.current.get(backendId);
      if (cached) {
        setSpeech({ messageId, status: "playing" });
        play(cached);
        return;
      }
      setSpeech({ messageId, status: "loading" });
      void voice.synthesize(backendId).then((blob) => {
        const url = URL.createObjectURL(blob);
        audioUrlsRef.current?.set(backendId, url);
        if (speechRequestRef.current !== messageId) return;
        play(url);
      }).catch((err) => {
        if (speechRequestRef.current !== messageId) return;
        setSpeech({
          messageId,
          status: "error",
          error: err instanceof Error ? err.message : "Could not play this message"
        });
      });
    },
    [voice, speech.messageId, speech.status, state.messages, getAudioElement, stopSpeech]
  );
  const dictationOptions = react.useMemo(
    () => buildLanguageOptions(voiceStatus?.locales),
    [voiceStatus?.locales]
  );
  const [dictation, setDictation] = react.useState(
    () => initialDictationState(voiceStatus, dictationOptions)
  );
  react.useEffect(() => {
    setDictation((prev) => syncWithStatus(prev, voiceStatus, dictationOptions));
  }, [voiceStatus, dictationOptions]);
  const setDictationLanguage = react.useCallback((language) => {
    setDictation((prev) => selectLanguage(prev, language));
  }, []);
  const dictate = react.useCallback(
    async (clip) => {
      if (!voice) throw new Error("Voice is not configured on this chat");
      const sent = dictation.language;
      const result = await voice.transcribe(clip, sent ?? void 0);
      setDictation(
        (prev) => learnFromTranscription(prev, sent, result, dictationOptions, voiceStatus?.autodetect_candidates)
      );
      return result;
    },
    [voice, dictation.language, dictationOptions, voiceStatus?.autodetect_candidates]
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
      regenerateLast,
      speech,
      toggleSpeech,
      dictation,
      dictationOptions,
      setDictationLanguage,
      dictate
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
      regenerateLast,
      speech,
      toggleSpeech,
      dictation,
      dictationOptions,
      setDictationLanguage,
      dictate
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
  speechStatus = "idle",
  speechError,
  onSpeak,
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
  const showSpeak = Boolean(onSpeak);
  const isPlaying = speechStatus === "playing";
  const isLoadingSpeech = speechStatus === "loading";
  const speechFailed = speechStatus === "error";
  const speakLabel = isPlaying ? "Stop reading aloud" : isLoadingSpeech ? "Preparing audio" : "Read aloud";
  if (allActions.length === 0 && !showFeedback && !showSpeak) return null;
  return /* @__PURE__ */ jsxRuntime.jsx("div", { className: "relative", children: /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      className: cn(
        "flex items-center gap-0.5",
        "transition-opacity duration-150",
        // Audio outlives the hover that started it, so an active or failed
        // speaker pins the bar open — otherwise Stop would be unreachable.
        isPlaying || isLoadingSpeech || speechFailed ? "opacity-100" : "opacity-0 group-hover/message:opacity-100",
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
        ] }),
        showSpeak && /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            type: "button",
            onClick: onSpeak,
            disabled: isLoadingSpeech,
            className: cn(
              "flex h-7 w-7 items-center justify-center",
              "rounded-[var(--cxc-radius-sm)]",
              "transition-colors duration-100",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-[var(--cxc-border-focus)]",
              "disabled:cursor-progress"
            ),
            style: {
              color: isPlaying ? "var(--cxc-text)" : speechFailed ? "var(--cxc-error)" : "var(--cxc-text-muted)"
            },
            onMouseOver: (e) => {
              if (isPlaying || speechFailed) return;
              e.currentTarget.style.backgroundColor = "var(--cxc-bg-muted)";
              e.currentTarget.style.color = "var(--cxc-text-secondary)";
            },
            onMouseOut: (e) => {
              if (isPlaying || speechFailed) return;
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--cxc-text-muted)";
            },
            "aria-label": speakLabel,
            "aria-pressed": isPlaying,
            title: speechFailed ? speechError ?? "Could not play this message" : speakLabel,
            children: isLoadingSpeech ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Loader2, { size: 14, className: "cxc-spin", "aria-hidden": "true" }) : isPlaying ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Square, { size: 12, fill: "currentColor", "aria-hidden": "true" }) : /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Volume2, { size: 14, "aria-hidden": "true" })
          }
        ),
        showSpeak && speechFailed && /* @__PURE__ */ jsxRuntime.jsx("span", { className: "ml-1 text-[12px]", style: { color: "var(--cxc-error)" }, role: "alert", children: speechError ?? "Could not play this message" })
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
var CHART_ZERO_LINE_STYLE = {
  stroke: "var(--cx-text-muted)",
  strokeWidth: 1,
  strokeOpacity: 0.5
};
var CHART_VALUE_LABEL_STYLE = {
  fontSize: 11,
  fontFamily: "inherit",
  fill: "var(--cx-text-secondary)"
};

// src/aui/chart-colors.ts
var CHART_FALLBACKS = [
  "#E56C4E",
  // 1 — warm coral / terracotta
  "#2A9D8F",
  // 2 — teal
  "#E9C46A",
  // 3 — soft gold
  "#264653",
  // 4 — deep teal
  "#F4A261",
  // 5 — sandy orange
  "#7C3AED",
  // 6 — violet
  "#00825A",
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
var PANEL_SIZE = {
  md: "w-full max-w-3xl",
  lg: "w-[min(92vw,1024px)] max-w-none"
};
var BODY_SIZE = {
  md: "px-5 py-4",
  // The tall expanded chart scrolls inside the dialog rather than pushing the
  // panel past the viewport, where its header would be unreachable.
  lg: "px-5 py-4 max-h-[80vh] overflow-y-auto"
};
var FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
function Dialog({ open, onClose, title, children, size = "md" }) {
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
          className: `${PANEL_SIZE[size]} rounded-lg border focus:outline-none`,
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
            /* @__PURE__ */ jsxRuntime.jsx("div", { className: BODY_SIZE[size], children })
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
      fontSize: CHART_LEGEND_STYLE.fontSize
    },
    labelStyle: {
      color: CHART_LEGEND_STYLE.color
    }
  };
}
function formatAxisTick(value) {
  return formatValue(value, "compact");
}
function formatTooltipValue(value) {
  return formatValue(value, "number");
}
function formatSeriesValue(value, series, { compact }) {
  if (series.format === "percent") return formatValue(value, "percent");
  return formatWithUnit(
    value,
    compact ? "compact" : series.format ?? "number",
    series.unit
  );
}
function seriesValueLabel(value, series) {
  return formatSeriesValue(value, series, { compact: true });
}
function longestValueLabel(data, series) {
  let longest = 0;
  for (const row of data) {
    for (const field of series) {
      const value = row[field.key];
      if (value === null || value === void 0 || value === "") continue;
      if (!Number.isFinite(Number(value))) continue;
      longest = Math.max(longest, seriesValueLabel(value, field).length);
    }
  }
  return longest;
}
function axisUnitFor(series) {
  const first = series[0]?.unit;
  if (!first) return void 0;
  return series.every((field) => field.unit === first) ? first : void 0;
}
function axisFieldFor(series) {
  const percent = series.length > 0 && series.every((field) => field.format === "percent");
  return {
    key: "",
    label: "",
    format: percent ? "percent" : void 0,
    unit: axisUnitFor(series)
  };
}
function makeAxisTickFormatter(series) {
  const field = axisFieldFor(series);
  return (value) => formatSeriesValue(value, field, { compact: true });
}
function makeTooltipValueFormatter(series) {
  const only = series.length === 1 ? series[0] : void 0;
  const byKey = new Map(series.map((field) => [field.key, field]));
  return (value, _name, item) => {
    const field = only ?? byKey.get(String(item?.dataKey ?? ""));
    return field ? formatSeriesValue(value, field, { compact: false }) : formatTooltipValue(value);
  };
}
function formatTooltipLabel(label) {
  return String(label ?? "");
}
function shouldShowLegend(seriesCount, showLegend) {
  return showLegend ?? seriesCount > 1;
}
var BAR_VALUE_DOMAIN = [
  (dataMin) => Math.min(0, dataMin),
  "auto"
];
var SPARSE_SERIES_POINT_LIMIT = 8;
function countPlottablePoints(data, key) {
  let count = 0;
  for (const row of data) {
    const value = row[key];
    if (value === null || value === void 0 || value === "") continue;
    if (Number.isFinite(typeof value === "number" ? value : Number(value))) count++;
  }
  return count;
}
function seriesDotProp(data, key) {
  return countPlottablePoints(data, key) <= SPARSE_SERIES_POINT_LIMIT ? { r: 3, strokeWidth: 0 } : false;
}

// src/aui/charts/label-fit.ts
var CHAR_PX = 6.6;
var MIN_LABEL_WIDTH = 44;
function fitLabel(label, maxChars) {
  if (label.length <= maxChars) return label;
  if (maxChars <= 1) return label.slice(0, 1);
  return `${label.slice(0, maxChars - 1)}\u2026`;
}
function fitLabelBothEnds(label, maxChars) {
  if (label.length <= maxChars) return label;
  if (maxChars <= 2) return label.slice(0, Math.max(1, maxChars));
  const keep = maxChars - 1;
  const tail = Math.floor(keep / 2);
  return `${label.slice(0, keep - tail)}\u2026${label.slice(label.length - tail)}`;
}
function fitCategoryLabelsReport(labels, maxChars) {
  const distinct = new Set(labels).size;
  const fromStart = labels.map((label) => fitLabel(label, maxChars));
  if (new Set(fromStart).size === distinct) return { labels: fromStart, collided: false };
  const bothEnds = labels.map((label) => fitLabelBothEnds(label, maxChars));
  return { labels: bothEnds, collided: new Set(bothEnds).size !== distinct };
}
function fitCategoryLabels(labels, maxChars) {
  return fitCategoryLabelsReport(labels, maxChars).labels;
}
function wrapLabel(label, maxChars, maxLines = 2) {
  if (maxChars < 1 || maxLines < 2) return null;
  if (label.length <= maxChars) return null;
  if (label.length > maxChars * maxLines) return null;
  const lines = [];
  let current = "";
  for (const word of label.split(/\s+/).filter(Boolean)) {
    if (word.length > maxChars) return null;
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    lines.push(current);
    if (lines.length >= maxLines) return null;
    current = word;
  }
  if (current) lines.push(current);
  return lines.length > 1 && lines.length <= maxLines ? lines : null;
}
var MEASUREMENT_SAMPLE = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
var AXIS_FONT = "12px sans-serif";
var measured = /* @__PURE__ */ new Map();
function measureCharPx(font = AXIS_FONT) {
  const cached = measured.get(font);
  if (cached !== void 0) return cached;
  const width = measureSample(font);
  measured.set(font, width);
  return width;
}
function measureSample(font) {
  if (typeof document === "undefined") return CHAR_PX;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return CHAR_PX;
  context.font = font;
  const width = context.measureText(MEASUREMENT_SAMPLE).width;
  if (!Number.isFinite(width) || width <= 0) return CHAR_PX;
  return width / MEASUREMENT_SAMPLE.length;
}

// src/aui/charts/chart-layout.ts
var BAND_PX = 28;
var MIN_BAND_PX = 22;
var INLINE_MAX_CATEGORIES = 12;
var CHART_CHROME_PX = 46;
var INLINE_MIN_HEIGHT_PX = 200;
var VERTICAL_CHART_HEIGHT_PX = 256;
var VALUE_LABEL_MIN_WIDTH_PX = 360;
var ANIMATION_MAX_ROWS = 30;
var MAX_SLICES = 8;
var AXIS_MIN_WIDTH_PX = 72;
var AXIS_MAX_WIDTH_RATIO = 0.4;
var LABEL_MAX_CHARS = 28;
var FLIP_MIN_CATEGORIES = 12;
var FLIP_LONG_LABEL_CATEGORIES = 6;
var FLIP_LONG_LABEL_CHARS = 12;
var GROUPED_BAND_STEP_PX = 8;
var GROUPED_BAND_MAX_PX = 56;
var NARROW_CHART_WIDTH_PX = 400;
var DEFAULT_CHART_WIDTH_PX = 600;
var EXPANDED_CHART_WIDTH_PX = 984;
var EXPANDED_VERTICAL_MIN_HEIGHT_PX = 360;
var TICK_INTERVAL_MIN_BAND_PX = 16;
var TICK_GAP_PX = 8;
var MIN_VISIBLE_TICKS = 4;
var VALUE_AXIS_ESTIMATE_PX = 48;
var AXIS_LABEL_PADDING_PX = 12;
var ORDERED_SAMPLE_LIMIT = 50;
var ORDERED_RATIO = 0.8;
var EQUIDISTANT_INTERVAL = "equidistantPreserveStart";
var FLIPPABLE_CHART_TYPES = /* @__PURE__ */ new Set([
  "bar",
  "bar_grouped",
  "bar_stacked"
]);
var BAR_CHART_TYPES = /* @__PURE__ */ new Set([
  "bar",
  "bar_horizontal",
  "bar_grouped",
  "bar_stacked"
]);
function clamp(low, value, high) {
  return Math.min(Math.max(value, low), high);
}
function toFiniteNumber(value) {
  if (value === null || value === void 0 || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}
function bandHeight(seriesCount, stacked) {
  if (stacked || seriesCount <= 1) return BAND_PX;
  return Math.min(GROUPED_BAND_MAX_PX, BAND_PX + GROUPED_BAND_STEP_PX * (seriesCount - 1));
}
function axisIntervalFor(bandPx) {
  return bandPx >= TICK_INTERVAL_MIN_BAND_PX ? 0 : EQUIDISTANT_INTERVAL;
}
function categoryLayout({
  rows,
  width,
  mode,
  seriesCount,
  stacked,
  longestLabelChars = 0,
  charPx = CHAR_PX
}) {
  const bandPx = bandHeight(seriesCount, stacked);
  const totalRows = Math.max(0, rows);
  const shownRows = mode === "expanded" ? totalRows : Math.min(totalRows, INLINE_MAX_CATEGORIES);
  const contentHeight = shownRows * bandPx + CHART_CHROME_PX;
  const hostHeight = mode === "expanded" ? contentHeight : clamp(INLINE_MIN_HEIGHT_PX, contentHeight, INLINE_MAX_CATEGORIES * bandPx + CHART_CHROME_PX);
  const axisCeiling = AXIS_MAX_WIDTH_RATIO * width;
  const axisWidth = Math.round(
    clamp(AXIS_MIN_WIDTH_PX, longestLabelChars * charPx + AXIS_LABEL_PADDING_PX, axisCeiling)
  );
  const maxChars = Math.max(
    1,
    Math.min(LABEL_MAX_CHARS, Math.floor((axisCeiling - AXIS_LABEL_PADDING_PX) / charPx))
  );
  return {
    hostHeight,
    shownRows,
    bandPx,
    axisWidth,
    maxChars,
    interval: axisIntervalFor(bandPx),
    // Stacked segments share one band and can each be a few pixels wide, so
    // their labels would land on top of one another. Grouped series pay for
    // their labels with a taller band (see bandHeight).
    showValueLabels: !stacked && bandPx >= MIN_BAND_PX && width >= VALUE_LABEL_MIN_WIDTH_PX,
    animate: shownRows <= ANIMATION_MAX_ROWS
  };
}
function verticalCategoryTicks({
  plotWidth,
  rows,
  longestLabelChars,
  charPx = CHAR_PX
}) {
  const bandPx = Math.max(1, plotWidth / Math.max(1, rows));
  const needed = Math.max(1, Math.ceil((longestLabelChars * charPx + TICK_GAP_PX) / bandPx));
  const stride = rows < MIN_VISIBLE_TICKS ? 1 : Math.min(needed, Math.max(1, Math.floor(rows / MIN_VISIBLE_TICKS)));
  return {
    stride,
    // recharts counts the ticks it SKIPS between two printed ones.
    interval: stride - 1,
    maxChars: Math.max(
      1,
      Math.min(LABEL_MAX_CHARS, Math.floor((bandPx * stride - TICK_GAP_PX) / charPx))
    )
  };
}
var VALUE_LABEL_FONT_RATIO = 11 / 12;
function verticalValueLabelsFit(plotWidth, marks, longestValueChars, charPx = CHAR_PX) {
  if (longestValueChars <= 0 || marks <= 0) return false;
  const bandWidth = plotWidth / marks;
  return bandWidth >= longestValueChars * charPx * VALUE_LABEL_FONT_RATIO;
}
var VALUE_LABEL_GAP_PX = 6;
var VALUE_LABEL_LINE_PX = 14;
function valueLabelReservePx(longestValueChars, charPx = CHAR_PX) {
  if (longestValueChars <= 0) return 0;
  return Math.ceil(longestValueChars * charPx * VALUE_LABEL_FONT_RATIO) + VALUE_LABEL_GAP_PX;
}
var ORDERED_PATTERNS = [
  // ISO date, with or without a time part: 2026-01-15, 2026-01-15T09:30:00Z
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/,
  // Year-month: 2026-01, 2026/1
  /^\d{4}[-/]\d{1,2}$/,
  // Year plus a period marker: 2026-Q1, 2026 H2, 2026W07
  /^\d{4}[-/ ]?(q[1-4]|h[12]|w\d{1,2})$/i,
  // The same written the other way round: Q1 2026, W07-2026
  /^(q[1-4]|h[12]|w\d{1,2})[-/ ]?\d{4}$/i,
  // Month name with a year: Jan 2026, January-2026, Jan. 26
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s,/-]+\d{2,4}$/i,
  // And the other way round: 2026 Jan
  /^\d{4}[\s,/-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?$/i
];
function isOrderedValue(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text === "") return false;
  if (Number.isFinite(Number(text))) return true;
  return ORDERED_PATTERNS.some((pattern) => pattern.test(text));
}
function isOrderedAxis(values) {
  const sample = [];
  for (const value of values) {
    if (value === null || value === void 0 || value === "") continue;
    sample.push(value);
    if (sample.length >= ORDERED_SAMPLE_LIMIT) break;
  }
  if (sample.length === 0) return false;
  let matches = 0;
  for (const value of sample) {
    if (isOrderedValue(value)) matches++;
  }
  return matches / sample.length >= ORDERED_RATIO;
}
function shouldFlipToHorizontal({
  chartType,
  rows,
  longestLabelChars,
  width,
  ordered
}) {
  if (!FLIPPABLE_CHART_TYPES.has(chartType)) return false;
  if (ordered) return false;
  if (rows > FLIP_MIN_CATEGORIES) return true;
  if (rows > FLIP_LONG_LABEL_CATEGORIES && longestLabelChars > FLIP_LONG_LABEL_CHARS) return true;
  return width < NARROW_CHART_WIDTH_PX && rows > FLIP_LONG_LABEL_CATEGORIES;
}
function valueLabelAnchor(value) {
  if (value < 0) return { side: "start", textAnchor: "end", dx: -VALUE_LABEL_GAP_PX };
  return { side: "end", textAnchor: "start", dx: VALUE_LABEL_GAP_PX };
}
function valueSigns(data, keys) {
  let positive = false;
  let negative = false;
  for (const row of data) {
    for (const key of keys) {
      const num = toFiniteNumber(row[key]);
      if (num === null) continue;
      if (num >= 0) positive = true;
      else negative = true;
      if (positive && negative) return { positive, negative };
    }
  }
  return { positive, negative };
}
function deriveTitle(x, series) {
  const measures = series.map((field) => field.label?.trim()).filter((label) => Boolean(label)).join(", ");
  const dimension = x.label?.trim() ?? "";
  if (measures && dimension) return `${measures} by ${dimension}`;
  return measures || dimension;
}
function collapseSlices(rows, max = MAX_SLICES) {
  if (max < 2 || rows.length <= max) return rows;
  const keep = max - 1;
  const kept = new Set(
    rows.map((slice, index) => ({ index, value: slice.value })).sort((a, b) => b.value - a.value || a.index - b.index).slice(0, keep).map((entry) => entry.index)
  );
  const slices = [];
  let otherTotal = 0;
  let otherCount = 0;
  rows.forEach((slice, index) => {
    if (kept.has(index)) {
      slices.push(slice);
      return;
    }
    otherTotal += slice.value;
    otherCount++;
  });
  slices.push({ name: `Other (${otherCount} categories)`, value: otherTotal });
  return slices;
}
function planBarLayout({
  chartType,
  xValues,
  orientation,
  width,
  mode,
  seriesCount,
  stacked,
  charPx = CHAR_PX
}) {
  const categories = xValues.map((value) => String(value ?? ""));
  const longestLabelChars = categories.reduce((longest, label) => Math.max(longest, label.length), 0);
  const requestedHorizontal = orientation === "vertical";
  const flipped = !requestedHorizontal && shouldFlipToHorizontal({
    chartType,
    rows: categories.length,
    longestLabelChars,
    width,
    ordered: isOrderedAxis(xValues)
  });
  return {
    horizontal: requestedHorizontal || flipped,
    flipped,
    categories,
    layout: categoryLayout({
      rows: categories.length,
      width,
      mode,
      seriesCount,
      stacked,
      longestLabelChars,
      charPx
    })
  };
}
var BASELINE_DY = {
  start: "0.71em",
  middle: "0.32em",
  end: "-0.3em"
};
var LINE_DY = "1.1em";
var WRAPPED_FIRST_DY = "-0.25em";
function makeCategoryTick({ fitted, maxChars, allowWrap }) {
  return function CategoryTick(props) {
    const raw = String(props.payload?.value ?? "");
    const x = Number(props.x);
    const y = Number(props.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const lines = allowWrap ? wrapLabel(raw, maxChars) : null;
    const printed = lines ?? [fitted.get(raw) ?? raw];
    const firstDy = lines ? WRAPPED_FIRST_DY : BASELINE_DY[props.verticalAnchor] ?? BASELINE_DY.middle;
    return /* @__PURE__ */ jsxRuntime.jsxs(
      "text",
      {
        className: props.className,
        x,
        y,
        fill: props.fill ?? CHART_Y_AXIS.stroke,
        fontSize: CHART_Y_AXIS.fontSize,
        fontFamily: CHART_Y_AXIS.fontFamily,
        textAnchor: props.textAnchor,
        children: [
          /* @__PURE__ */ jsxRuntime.jsx("title", { children: raw }),
          printed.map((line, index) => /* @__PURE__ */ jsxRuntime.jsx("tspan", { x, dy: index === 0 ? firstDy : LINE_DY, children: line }, `${line}-${index}`))
        ]
      }
    );
  };
}
function useCategoryTicks({
  data,
  xKey,
  plotWidth,
  charPx = CHAR_PX
}) {
  return react.useMemo(() => {
    const categories = data.map((row) => String(row[xKey] ?? ""));
    const longestLabelChars = categories.reduce(
      (longest, label) => Math.max(longest, label.length),
      0
    );
    const { interval, maxChars } = verticalCategoryTicks({
      plotWidth,
      rows: categories.length,
      longestLabelChars,
      charPx
    });
    const labels = fitCategoryLabels(categories, maxChars);
    const fitted = /* @__PURE__ */ new Map();
    categories.forEach((raw, index) => {
      if (!fitted.has(raw)) fitted.set(raw, labels[index]);
    });
    return {
      interval,
      tick: makeCategoryTick({ fitted, maxChars, allowWrap: false }),
      // recharts measures this string to lay the axis out, so it has to be the
      // string that is actually painted — not the raw label.
      tickFormatter: (value) => {
        const raw = String(value ?? "");
        return fitted.get(raw) ?? raw;
      },
      tooltipLabelFormatter: formatTooltipLabel
    };
  }, [data, xKey, plotWidth, charPx]);
}
function useSeriesFormatters(series) {
  return react.useMemo(
    () => ({
      tick: makeAxisTickFormatter(series),
      tooltip: makeTooltipValueFormatter(series)
    }),
    [series]
  );
}
function ChartEmpty({ label = "No data", reason }) {
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      className: "flex h-full items-center justify-center px-3 text-center text-sm",
      style: { color: "var(--cx-text-muted)" },
      role: "status",
      "aria-label": label,
      "data-cxc-empty-reason": reason,
      children: label
    }
  );
}
var DEFAULT_MARGIN_PX = 5;
function BarChart({
  data,
  x,
  series,
  options,
  mode = "inline",
  width = DEFAULT_CHART_WIDTH_PX,
  chartType = "bar",
  plan
}) {
  const stacked = options?.stacked ?? false;
  const seriesCount = series.length;
  const charPx = measureCharPx();
  const resolved = react.useMemo(
    () => plan ?? planBarLayout({
      chartType,
      xValues: data.map((row) => row[x.key]),
      orientation: options?.orientation,
      width,
      mode,
      seriesCount,
      stacked,
      charPx
    }),
    [plan, chartType, data, x.key, options?.orientation, width, mode, seriesCount, stacked, charPx]
  );
  const { horizontal, flipped, categories, layout } = resolved;
  const plotWidth = Math.max(1, width - VALUE_AXIS_ESTIMATE_PX);
  const verticalTicks = useCategoryTicks({ data, xKey: x.key, plotWidth, charPx });
  const horizontalTicks = react.useMemo(() => {
    const maxChars = layout.maxChars;
    const labels = fitCategoryLabels(categories, maxChars);
    const fitted = /* @__PURE__ */ new Map();
    categories.forEach((raw, index) => {
      if (!fitted.has(raw)) fitted.set(raw, labels[index]);
    });
    return {
      // Two lines need a tall band, so only a horizontal chart can offer them.
      tick: makeCategoryTick({ fitted, maxChars, allowWrap: layout.bandPx >= BAND_PX }),
      tickFormatter: (value) => {
        const raw = String(value ?? "");
        return fitted.get(raw) ?? raw;
      }
    };
  }, [categories, layout.maxChars, layout.bandPx]);
  const valueLabels = react.useMemo(
    () => series.map((field) => makeValueLabel(horizontal, field)),
    [series, horizontal]
  );
  const formatters = useSeriesFormatters(series);
  const seriesKeys = react.useMemo(() => series.map((field) => field.key), [series]);
  const signs = react.useMemo(() => valueSigns(data, seriesKeys), [data, seriesKeys]);
  const mixedSigns = signs.positive && signs.negative;
  const longestValueChars = react.useMemo(() => longestValueLabel(data, series), [data, series]);
  if (!data.length || !x.key || seriesCount === 0) {
    return /* @__PURE__ */ jsxRuntime.jsx(ChartEmpty, {});
  }
  const showLegend = shouldShowLegend(seriesCount, options?.showLegend);
  const seriesLabels = series.map((s) => s.label).join(", ");
  const showValueLabels = layout.showValueLabels && (horizontal || verticalValueLabelsFit(plotWidth, data.length * seriesCount, longestValueChars, charPx));
  const reserve = showValueLabels ? valueLabelReservePx(longestValueChars, charPx) : 0;
  const chartMargin = {
    top: !horizontal && reserve > 0 ? DEFAULT_MARGIN_PX + VALUE_LABEL_LINE_PX : DEFAULT_MARGIN_PX,
    right: horizontal && signs.positive ? DEFAULT_MARGIN_PX + reserve : DEFAULT_MARGIN_PX,
    bottom: DEFAULT_MARGIN_PX,
    // Negative bars grow leftwards, so their labels need the room on that side.
    left: horizontal && signs.negative ? DEFAULT_MARGIN_PX + reserve : DEFAULT_MARGIN_PX
  };
  const categoryAxis = {
    ...CHART_Y_AXIS,
    dataKey: x.key,
    ...horizontal ? horizontalTicks : { tick: verticalTicks.tick, tickFormatter: verticalTicks.tickFormatter }
  };
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      className: "h-full w-full min-w-0",
      "data-cxc-layout": flipped ? "flipped" : void 0,
      children: /* @__PURE__ */ jsxRuntime.jsx(
        recharts.ResponsiveContainer,
        {
          width: "100%",
          height: "100%",
          initialDimension: CHART_INITIAL_DIMENSION,
          debounce: mode === "expanded" ? 50 : 0,
          children: /* @__PURE__ */ jsxRuntime.jsxs(
            recharts.BarChart,
            {
              data,
              margin: chartMargin,
              layout: horizontal ? "vertical" : "horizontal",
              accessibilityLayer: true,
              "aria-label": `Bar chart of ${seriesLabels} by ${x.label}`,
              children: [
                /* @__PURE__ */ jsxRuntime.jsx(recharts.CartesianGrid, { ...CHART_GRID_STYLE }),
                horizontal ? /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntime.jsx(
                    recharts.XAxis,
                    {
                      ...CHART_X_AXIS,
                      type: "number",
                      domain: BAR_VALUE_DOMAIN,
                      tickFormatter: formatters.tick,
                      orientation: mode === "expanded" ? "top" : "bottom"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntime.jsx(
                    recharts.YAxis,
                    {
                      ...categoryAxis,
                      type: "category",
                      width: layout.axisWidth,
                      interval: layout.interval
                    }
                  )
                ] }) : /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntime.jsx(recharts.XAxis, { ...categoryAxis, interval: verticalTicks.interval }),
                  /* @__PURE__ */ jsxRuntime.jsx(
                    recharts.YAxis,
                    {
                      ...CHART_Y_AXIS,
                      type: "number",
                      width: "auto",
                      domain: BAR_VALUE_DOMAIN,
                      tickFormatter: formatters.tick
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntime.jsx(
                  recharts.Tooltip,
                  {
                    cursor: false,
                    contentStyle: CHART_TOOLTIP_STYLE,
                    formatter: formatters.tooltip,
                    labelFormatter: verticalTicks.tooltipLabelFormatter
                  }
                ),
                showLegend && /* @__PURE__ */ jsxRuntime.jsx(recharts.Legend, { ...chartLegendProps() }),
                mixedSigns && /* @__PURE__ */ jsxRuntime.jsx(recharts.ReferenceLine, { ...horizontal ? { x: 0 } : { y: 0 }, ...CHART_ZERO_LINE_STYLE }),
                series.map((s, index) => /* @__PURE__ */ jsxRuntime.jsx(
                  recharts.Bar,
                  {
                    dataKey: s.key,
                    name: s.label,
                    fill: getChartColor(index),
                    radius: 4,
                    stackId: stacked ? "stack" : void 0,
                    minPointSize: 2,
                    isAnimationActive: layout.animate,
                    animationDuration: CHART_ANIMATION.duration,
                    animationEasing: CHART_ANIMATION.easing,
                    children: showValueLabels && /* @__PURE__ */ jsxRuntime.jsx(recharts.LabelList, { dataKey: s.key, content: valueLabels[index] })
                  },
                  s.key
                ))
              ]
            }
          )
        }
      )
    }
  );
}
function toBarRect(viewBox) {
  if (!viewBox || typeof viewBox !== "object") return null;
  const { x, y, width, height } = viewBox;
  if (![x, y, width, height].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return null;
  }
  const [left, w] = normalize(x, width);
  const [top, h] = normalize(y, height);
  return { x: left, y: top, width: w, height: h };
}
function normalize(origin, extent) {
  return extent < 0 ? [origin + extent, -extent] : [origin, extent];
}
function makeValueLabel(horizontal, field) {
  const print = (value) => seriesValueLabel(value, field);
  return function BarValueLabel(props) {
    const rect = toBarRect(props.viewBox);
    const raw = props.value;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!rect || !Number.isFinite(value)) return /* @__PURE__ */ jsxRuntime.jsx(jsxRuntime.Fragment, {});
    const anchor = valueLabelAnchor(value);
    if (!horizontal) {
      const above = value < 0;
      return /* @__PURE__ */ jsxRuntime.jsx(
        "text",
        {
          x: rect.x + rect.width / 2,
          y: above ? rect.y + rect.height : rect.y,
          dy: above ? "1em" : "-0.4em",
          textAnchor: "middle",
          ...CHART_VALUE_LABEL_STYLE,
          children: print(value)
        }
      );
    }
    const edge = anchor.side === "end" ? rect.x + rect.width : rect.x;
    return /* @__PURE__ */ jsxRuntime.jsx(
      "text",
      {
        x: edge + anchor.dx,
        y: rect.y + rect.height / 2,
        dy: "0.32em",
        textAnchor: anchor.textAnchor,
        ...CHART_VALUE_LABEL_STYLE,
        children: print(value)
      }
    );
  };
}
function LineChart2({ data, x, series, options, width = DEFAULT_CHART_WIDTH_PX }) {
  const formatters = useSeriesFormatters(series);
  const ticks = useCategoryTicks({
    data,
    xKey: x.key,
    plotWidth: Math.max(1, width - VALUE_AXIS_ESTIMATE_PX),
    charPx: measureCharPx()
  });
  if (!data.length || !x.key || series.length === 0) {
    return /* @__PURE__ */ jsxRuntime.jsx(ChartEmpty, {});
  }
  const showLegend = shouldShowLegend(series.length, options?.showLegend);
  const seriesLabels = series.map((s) => s.label).join(", ");
  const animate = data.length <= ANIMATION_MAX_ROWS;
  return /* @__PURE__ */ jsxRuntime.jsx(recharts.ResponsiveContainer, { width: "100%", height: "100%", initialDimension: CHART_INITIAL_DIMENSION, children: /* @__PURE__ */ jsxRuntime.jsxs(
    recharts.LineChart,
    {
      data,
      accessibilityLayer: true,
      "aria-label": `Line chart of ${seriesLabels} by ${x.label}`,
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(recharts.CartesianGrid, { ...CHART_GRID_STYLE }),
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.XAxis,
          {
            ...CHART_X_AXIS,
            dataKey: x.key,
            tickFormatter: ticks.tickFormatter,
            tick: ticks.tick,
            interval: ticks.interval
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.YAxis, { ...CHART_Y_AXIS, width: "auto", tickFormatter: formatters.tick }),
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Tooltip,
          {
            cursor: false,
            contentStyle: CHART_TOOLTIP_STYLE,
            formatter: formatters.tooltip,
            labelFormatter: ticks.tooltipLabelFormatter
          }
        ),
        showLegend && /* @__PURE__ */ jsxRuntime.jsx(recharts.Legend, { ...chartLegendProps() }),
        series.map((s, index) => /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Line,
          {
            dataKey: s.key,
            name: s.label,
            type: "monotone",
            stroke: getChartColor(index),
            strokeWidth: 2,
            dot: seriesDotProp(data, s.key),
            activeDot: { r: 4, strokeWidth: 0 },
            isAnimationActive: animate,
            animationDuration: CHART_ANIMATION.duration,
            animationEasing: CHART_ANIMATION.easing
          },
          s.key
        ))
      ]
    }
  ) });
}
function AreaChart({ data, x, series, options, width = DEFAULT_CHART_WIDTH_PX }) {
  const uid = react.useId();
  const formatters = useSeriesFormatters(series);
  const ticks = useCategoryTicks({
    data,
    xKey: x.key,
    plotWidth: Math.max(1, width - VALUE_AXIS_ESTIMATE_PX),
    charPx: measureCharPx()
  });
  if (!data.length || !x.key || series.length === 0) {
    return /* @__PURE__ */ jsxRuntime.jsx(ChartEmpty, {});
  }
  const showLegend = shouldShowLegend(series.length, options?.showLegend);
  const seriesLabels = series.map((s) => s.label).join(", ");
  const animate = data.length <= ANIMATION_MAX_ROWS;
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
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.XAxis,
          {
            ...CHART_X_AXIS,
            dataKey: x.key,
            tickFormatter: ticks.tickFormatter,
            tick: ticks.tick,
            interval: ticks.interval
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.YAxis, { ...CHART_Y_AXIS, width: "auto", tickFormatter: formatters.tick }),
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Tooltip,
          {
            cursor: false,
            contentStyle: CHART_TOOLTIP_STYLE,
            formatter: formatters.tooltip,
            labelFormatter: ticks.tooltipLabelFormatter
          }
        ),
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
            dot: seriesDotProp(data, s.key),
            stackId: options?.stacked ? "stack" : void 0,
            isAnimationActive: animate,
            animationDuration: CHART_ANIMATION.duration,
            animationEasing: CHART_ANIMATION.easing
          },
          s.key
        ))
      ]
    }
  ) });
}
function readSlices(rows) {
  let total = 0;
  for (const slice of rows) {
    if (!Number.isFinite(slice.value) || slice.value < 0) return { slices: [], invalid: true };
    total += slice.value;
  }
  if (!(total > 0)) return { slices: [], invalid: true };
  return { slices: collapseSlices(rows, MAX_SLICES), invalid: false };
}
function PieChart({ data, x, series, options, donut = false }) {
  const valueKey = series[0]?.key;
  const valueLabel = series[0]?.label ?? "";
  const formatters = useSeriesFormatters(series);
  const { slices, invalid } = react.useMemo(() => {
    if (!data.length || !x.key || !valueKey) return { slices: [], invalid: false };
    return readSlices(
      data.map((row) => {
        const raw = row[valueKey];
        return {
          name: String(row[x.key] ?? ""),
          // A blank cell is a missing measurement, so it takes no share.
          value: raw === null || raw === void 0 || raw === "" ? 0 : Number(raw)
        };
      })
    );
  }, [data, x.key, valueKey]);
  if (invalid) {
    return /* @__PURE__ */ jsxRuntime.jsx(
      ChartEmpty,
      {
        label: "These values cannot be drawn as a pie: a share of a whole cannot be negative.",
        reason: "pie_invalid_values"
      }
    );
  }
  if (!slices.length) {
    return /* @__PURE__ */ jsxRuntime.jsx(ChartEmpty, { label: "No data available" });
  }
  const showLegend = shouldShowLegend(slices.length, options?.showLegend);
  return /* @__PURE__ */ jsxRuntime.jsx(recharts.ResponsiveContainer, { width: "100%", height: "100%", initialDimension: CHART_INITIAL_DIMENSION, children: /* @__PURE__ */ jsxRuntime.jsxs(
    recharts.PieChart,
    {
      accessibilityLayer: true,
      "aria-label": `${donut ? "Donut" : "Pie"} chart of ${valueLabel} by ${x.label}`,
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Pie,
          {
            data: slices,
            dataKey: "value",
            nameKey: "name",
            cx: "50%",
            cy: "50%",
            innerRadius: donut ? "60%" : 0,
            outerRadius: "80%",
            paddingAngle: 2,
            strokeWidth: 0,
            isAnimationActive: slices.length <= ANIMATION_MAX_ROWS,
            animationDuration: CHART_ANIMATION.duration,
            animationEasing: CHART_ANIMATION.easing,
            children: slices.map((slice, index) => /* @__PURE__ */ jsxRuntime.jsx(
              recharts.Cell,
              {
                fill: getChartColor(index),
                className: "outline-none focus:outline-none"
              },
              `cell-${slice.name}-${index}`
            ))
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(recharts.Tooltip, { contentStyle: CHART_TOOLTIP_STYLE, formatter: formatters.tooltip }),
        showLegend && // Intentionally diverges from chartLegendProps(): the pie legend is
        // bottom-aligned with circle swatches, since its slices are otherwise
        // unlabeled. `labelStyle` matters for the same reason it does there —
        // recharts paints legend text in the slice color unless told not to.
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Legend,
          {
            wrapperStyle: { fontSize: CHART_LEGEND_STYLE.fontSize },
            labelStyle: { color: CHART_LEGEND_STYLE.color },
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
  const formatters = useSeriesFormatters(series);
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
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.XAxis,
          {
            ...CHART_X_AXIS,
            dataKey: x.key,
            type: "number",
            name: x.label,
            tickFormatter: formatAxisTick
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.YAxis,
          {
            ...CHART_Y_AXIS,
            type: "number",
            width: "auto",
            tickFormatter: formatters.tick
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          recharts.Tooltip,
          {
            cursor: { strokeDasharray: "3 3" },
            contentStyle: CHART_TOOLTIP_STYLE,
            formatter: formatters.tooltip
          }
        ),
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

// src/aui/charts/box-plot-geometry.ts
var BOX_PLOT_KEYS = ["q_min", "q1", "median", "q3", "q_max"];
function resolveBoxPlotSeries(series) {
  const byKey = new Map(series.map((field) => [field.key, field]));
  const missing = BOX_PLOT_KEYS.filter((key) => !byKey.has(key));
  if (missing.length > 0) return { fields: null, missing };
  const fields = Object.fromEntries(
    BOX_PLOT_KEYS.map((key) => [key, byKey.get(key)])
  );
  return { fields, missing: [] };
}
function toFiniteNumber2(value) {
  if (value === null || value === void 0 || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}
function parseBoxPlotRows(data, categoryKey) {
  if (data.length === 0) return { boxes: [], omitted: 0, rejection: "no_rows" };
  const boxes = [];
  let nonNumeric = 0;
  let nonMonotonic = 0;
  for (const row of data) {
    const values = BOX_PLOT_KEYS.map((key) => toFiniteNumber2(row[key]));
    if (values.some((value) => value === null)) {
      nonNumeric++;
      continue;
    }
    const [qMin, q1, median, q3, qMax] = values;
    if (!(qMin <= q1 && q1 <= median && median <= q3 && q3 <= qMax)) {
      nonMonotonic++;
      continue;
    }
    boxes.push({
      category: String(row[categoryKey] ?? ""),
      q_min: qMin,
      q1,
      median,
      q3,
      q_max: qMax
    });
  }
  const omitted = nonNumeric + nonMonotonic;
  const rejection = omitted === 0 ? null : nonMonotonic >= nonNumeric ? "non_monotonic_quartiles" : "non_numeric_quartiles";
  return { boxes, omitted, rejection };
}
function boxPlotDomain(boxes) {
  if (boxes.length === 0) return [0, 1];
  let min = Infinity;
  let max = -Infinity;
  for (const box of boxes) {
    if (box.q_min < min) min = box.q_min;
    if (box.q_max > max) max = box.q_max;
  }
  if (min === max) {
    const pad2 = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    return [min - pad2, max + pad2];
  }
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}
function niceStep(range, count) {
  const rough = range / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}
function valueAxisTicks([min, max], count = 4) {
  if (!(max > min)) return [min];
  const step = niceStep(max - min, count);
  const ticks = [];
  const limit = count * 4;
  for (let tick = Math.ceil(min / step) * step; tick <= max && ticks.length < limit; tick += step) {
    ticks.push(Number((Math.round(tick / step) * step).toPrecision(12)));
  }
  return ticks;
}
function makeValueScale([min, max], plotTop, plotHeight) {
  const span = max - min;
  if (span <= 0) return () => plotTop + plotHeight / 2;
  return (value) => plotTop + plotHeight - (value - min) / span * plotHeight;
}
var AXIS_LABEL_GAP = 8;
var CATEGORY_AXIS_HEIGHT = 22;
var PLOT_PADDING_TOP = 10;
var PLOT_PADDING_RIGHT = 8;
var MIN_BOX_WIDTH = 6;
var MAX_BOX_WIDTH = 44;
var BOX_WIDTH_RATIO = 0.62;
function computeBoxPlotLayout(width, height, categoryCount, axisTickLabels) {
  const widestTick = axisTickLabels.reduce((longest, label) => Math.max(longest, label.length), 0);
  const plotLeft = Math.min(width * 0.4, widestTick * CHAR_PX + AXIS_LABEL_GAP);
  const plotWidth = Math.max(0, width - plotLeft - PLOT_PADDING_RIGHT);
  const plotHeight = Math.max(0, height - PLOT_PADDING_TOP - CATEGORY_AXIS_HEIGHT);
  const bands = Math.max(1, categoryCount);
  const bandWidth = plotWidth / bands;
  const boxWidth = Math.min(MAX_BOX_WIDTH, Math.max(MIN_BOX_WIDTH, bandWidth * BOX_WIDTH_RATIO));
  const labelStride = Math.max(1, Math.ceil(MIN_LABEL_WIDTH / Math.max(1, bandWidth)));
  const labelMaxChars = Math.max(1, Math.floor((bandWidth * labelStride - 4) / CHAR_PX));
  return {
    plotLeft,
    plotTop: PLOT_PADDING_TOP,
    plotWidth,
    plotHeight,
    bandWidth,
    boxWidth,
    labelStride,
    labelMaxChars
  };
}
function bandCenter(layout, index) {
  return layout.plotLeft + layout.bandWidth * (index + 0.5);
}
var BOX_FILL_OPACITY = 0.18;
var BOX_STROKE_WIDTH = 1.5;
var MEDIAN_STROKE_WIDTH = 2;
var CAP_RATIO = 0.55;
var MAX_STAGGER_STEPS = 10;
function BoxPlotChart({ data, x, series }) {
  const resolution = react.useMemo(() => resolveBoxPlotSeries(series), [series]);
  const valueField = react.useMemo(() => axisFieldFor(series), [series]);
  const parse = react.useMemo(() => parseBoxPlotRows(data, x.key), [data, x.key]);
  if (!resolution.fields) {
    return /* @__PURE__ */ jsxRuntime.jsx(
      ChartEmpty,
      {
        reason: "missing_quartile_series",
        label: `Box plot needs the ${BOX_PLOT_KEYS.length} quartile series \u2014 missing ${resolution.missing.join(", ")}`
      }
    );
  }
  if (parse.boxes.length === 0) {
    return /* @__PURE__ */ jsxRuntime.jsx(ChartEmpty, { reason: parse.rejection ?? "no_rows", label: emptyLabel(parse.rejection) });
  }
  return /* @__PURE__ */ jsxRuntime.jsx(
    BoxPlotSurface,
    {
      boxes: parse.boxes,
      category: x,
      measure: resolution.fields.median,
      valueField,
      omitted: parse.omitted
    }
  );
}
function emptyLabel(rejection) {
  switch (rejection) {
    case "non_monotonic_quartiles":
      return "No distribution to plot \u2014 the quartiles are not ordered q_min \u2264 q1 \u2264 median \u2264 q3 \u2264 q_max";
    case "non_numeric_quartiles":
      return "No distribution to plot \u2014 the quartile values are missing or not numeric";
    default:
      return "No data";
  }
}
function BoxPlotSurface({ boxes, category, measure, valueField, omitted }) {
  const [host, size] = useElementSize();
  const [activeIndex, setActiveIndex] = react.useState(null);
  const color = getChartColor(0);
  const printTick = react.useCallback(
    (value) => formatSeriesValue(value, valueField, { compact: true }),
    [valueField]
  );
  const printValue = react.useCallback(
    (value) => formatSeriesValue(value, valueField, { compact: false }),
    [valueField]
  );
  const geometry = react.useMemo(() => {
    const domain = boxPlotDomain(boxes);
    const ticks2 = valueAxisTicks(domain);
    const layout2 = computeBoxPlotLayout(size.width, size.height, boxes.length, ticks2.map(printTick));
    return { ticks: ticks2, layout: layout2, scale: makeValueScale(domain, layout2.plotTop, layout2.plotHeight) };
  }, [boxes, size.width, size.height, printTick]);
  const { ticks, layout, scale } = geometry;
  const categoryLabels = react.useMemo(() => {
    const indices = boxes.map((_, index) => index).filter((index) => index % layout.labelStride === 0);
    const fitted = fitCategoryLabels(
      indices.map((index) => boxes[index].category),
      layout.labelMaxChars
    );
    return indices.map((index, position) => ({ index, label: fitted[position] }));
  }, [boxes, layout.labelStride, layout.labelMaxChars]);
  const clearActive = react.useCallback(() => setActiveIndex(null), []);
  const active = react.useMemo(() => {
    if (activeIndex === null) return null;
    const box = boxes[activeIndex];
    return box ? { index: activeIndex, box } : null;
  }, [activeIndex, boxes]);
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex h-full w-full min-w-0 flex-col", children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { ref: host, className: "relative min-h-0 w-full flex-1", children: [
      /* @__PURE__ */ jsxRuntime.jsxs(
        "svg",
        {
          width: size.width,
          height: size.height,
          role: "group",
          "aria-label": `Box plot of ${measure.label} distribution by ${category.label}, ${boxes.length} categories`,
          onPointerLeave: clearActive,
          children: [
            ticks.map((tick) => {
              const y = scale(tick);
              return /* @__PURE__ */ jsxRuntime.jsxs("g", { children: [
                /* @__PURE__ */ jsxRuntime.jsx(
                  "line",
                  {
                    x1: layout.plotLeft,
                    x2: layout.plotLeft + layout.plotWidth,
                    y1: y,
                    y2: y,
                    stroke: CHART_GRID_STYLE.stroke,
                    strokeDasharray: CHART_GRID_STYLE.strokeDasharray,
                    strokeOpacity: CHART_GRID_STYLE.strokeOpacity
                  }
                ),
                /* @__PURE__ */ jsxRuntime.jsx(
                  "text",
                  {
                    x: layout.plotLeft - CHART_Y_AXIS.tickMargin,
                    y,
                    textAnchor: "end",
                    dominantBaseline: "middle",
                    fontSize: CHART_Y_AXIS.fontSize,
                    fontFamily: CHART_Y_AXIS.fontFamily,
                    fill: CHART_Y_AXIS.stroke,
                    children: printTick(tick)
                  }
                )
              ] }, tick);
            }),
            boxes.map((box, index) => /* @__PURE__ */ jsxRuntime.jsx(
              BoxMark,
              {
                box,
                index,
                color,
                layout,
                scale,
                category,
                printValue,
                isActive: index === activeIndex,
                onActivate: setActiveIndex,
                onDeactivate: clearActive
              },
              `${box.category}-${index}`
            )),
            categoryLabels.map(({ index, label }) => /* @__PURE__ */ jsxRuntime.jsx(
              "text",
              {
                x: bandCenter(layout, index),
                y: layout.plotTop + layout.plotHeight + CHART_X_AXIS.tickMargin + 4,
                textAnchor: "middle",
                fontSize: CHART_X_AXIS.fontSize,
                fontFamily: CHART_X_AXIS.fontFamily,
                fill: CHART_X_AXIS.stroke,
                children: label
              },
              `label-${index}`
            ))
          ]
        }
      ),
      active && /* @__PURE__ */ jsxRuntime.jsx(
        BoxTooltip,
        {
          box: active.box,
          printValue,
          x: bandCenter(layout, active.index),
          y: scale(active.box.q_max),
          containerWidth: size.width
        }
      )
    ] }),
    omitted > 0 && /* @__PURE__ */ jsxRuntime.jsxs(
      "p",
      {
        className: "pt-1 text-center text-[11px]",
        style: { color: "var(--cx-text-muted)" },
        "data-cxc-omitted": omitted,
        children: [
          omitted,
          " ",
          omitted === 1 ? "category" : "categories",
          " not shown \u2014 inconsistent quartile values"
        ]
      }
    )
  ] });
}
function BoxMark({
  box,
  index,
  color,
  layout,
  scale,
  category,
  printValue,
  isActive,
  onActivate,
  onDeactivate
}) {
  const center = bandCenter(layout, index);
  const half = layout.boxWidth / 2;
  const capHalf = half * CAP_RATIO;
  const yMax = scale(box.q_max);
  const yQ3 = scale(box.q3);
  const yMedian = scale(box.median);
  const yQ1 = scale(box.q1);
  const yMin = scale(box.q_min);
  const boxHeight = Math.max(1, yQ1 - yQ3);
  const activate = react.useCallback(() => onActivate(index), [onActivate, index]);
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "g",
    {
      role: "img",
      tabIndex: 0,
      "aria-label": describeBox(box, category, printValue),
      className: "cxc-boxplot-mark focus:outline-none",
      style: { animationDelay: `${Math.min(index, MAX_STAGGER_STEPS) * 40}ms` },
      onPointerEnter: activate,
      onPointerDown: activate,
      onFocus: activate,
      onBlur: onDeactivate,
      children: [
        /* @__PURE__ */ jsxRuntime.jsx("line", { x1: center, x2: center, y1: yMax, y2: yQ3, stroke: color, strokeWidth: BOX_STROKE_WIDTH }),
        /* @__PURE__ */ jsxRuntime.jsx("line", { x1: center, x2: center, y1: yQ1, y2: yMin, stroke: color, strokeWidth: BOX_STROKE_WIDTH }),
        /* @__PURE__ */ jsxRuntime.jsx(
          "line",
          {
            x1: center - capHalf,
            x2: center + capHalf,
            y1: yMax,
            y2: yMax,
            stroke: color,
            strokeWidth: BOX_STROKE_WIDTH
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          "line",
          {
            x1: center - capHalf,
            x2: center + capHalf,
            y1: yMin,
            y2: yMin,
            stroke: color,
            strokeWidth: BOX_STROKE_WIDTH
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          "rect",
          {
            x: center - half,
            y: yQ3,
            width: layout.boxWidth,
            height: boxHeight,
            rx: 2,
            fill: color,
            fillOpacity: isActive ? BOX_FILL_OPACITY * 2 : BOX_FILL_OPACITY,
            stroke: color,
            strokeWidth: BOX_STROKE_WIDTH
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          "line",
          {
            x1: center - half,
            x2: center + half,
            y1: yMedian,
            y2: yMedian,
            stroke: "var(--cx-text-primary)",
            strokeWidth: MEDIAN_STROKE_WIDTH
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          "rect",
          {
            x: center - layout.bandWidth / 2,
            y: layout.plotTop,
            width: layout.bandWidth,
            height: layout.plotHeight,
            fill: "transparent"
          }
        )
      ]
    }
  );
}
function describeBox(box, category, printValue) {
  return `${category.label} ${box.category}: minimum ${printValue(box.q_min)}, lower quartile ${printValue(box.q1)}, median ${printValue(box.median)}, upper quartile ${printValue(box.q3)}, maximum ${printValue(box.q_max)}`;
}
var TOOLTIP_ROWS = [
  { key: "q_max", label: "Max" },
  { key: "q3", label: "Q3" },
  { key: "median", label: "Median" },
  { key: "q1", label: "Q1" },
  { key: "q_min", label: "Min" }
];
var TOOLTIP_WIDTH = 148;
var TOOLTIP_FLIP_THRESHOLD = 96;
function BoxTooltip({
  box,
  printValue,
  x,
  y,
  containerWidth
}) {
  const half = TOOLTIP_WIDTH / 2;
  const left = Math.min(Math.max(x, half), Math.max(half, containerWidth - half));
  const flip = y < TOOLTIP_FLIP_THRESHOLD;
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      role: "tooltip",
      className: "pointer-events-none absolute z-10 px-2 py-1.5",
      style: {
        ...CHART_TOOLTIP_STYLE,
        width: TOOLTIP_WIDTH,
        left,
        top: flip ? y + 8 : y - 8,
        transform: flip ? "translate(-50%, 0)" : "translate(-50%, -100%)"
      },
      children: [
        /* @__PURE__ */ jsxRuntime.jsx("p", { className: "mb-1 truncate font-medium", style: { color: "var(--cx-text-primary)" }, children: box.category }),
        TOOLTIP_ROWS.map((row) => /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntime.jsx("span", { style: { color: "var(--cx-text-muted)" }, children: row.label }),
          /* @__PURE__ */ jsxRuntime.jsx("span", { style: { color: "var(--cx-text-primary)" }, children: printValue(box[row.key]) })
        ] }, row.key))
      ]
    }
  );
}
function useElementSize() {
  const ref = react.useRef(null);
  const [size, setSize] = react.useState({
    ...CHART_INITIAL_DIMENSION
  });
  react.useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}
function chartOptionsFor(block) {
  const stacked = block.options?.stacked ?? (block.chart_type === "bar_stacked" || block.chart_type === "area_stacked");
  const orientation = block.options?.orientation ?? (block.chart_type === "bar_horizontal" ? "vertical" : void 0);
  return {
    stacked,
    showLegend: block.options?.show_legend,
    orientation
  };
}
function ChartDispatch({ block, mode, width, plan }) {
  const props = {
    data: block.data,
    x: block.x,
    series: block.series,
    options: chartOptionsFor(block),
    mode,
    width,
    chartType: block.chart_type,
    plan
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
    case "box_plot":
      return /* @__PURE__ */ jsxRuntime.jsx(BoxPlotChart, { ...props });
    default:
      return /* @__PURE__ */ jsxRuntime.jsx(ChartEmpty, { label: "Unsupported chart type" });
  }
}
function useElementWidth(ref, fallback = DEFAULT_CHART_WIDTH_PX) {
  const [width, setWidth] = react.useState(fallback);
  react.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof window === "undefined" || typeof ResizeObserver === "undefined") {
      const measured2 = element.getBoundingClientRect().width;
      if (measured2 > 0) setWidth(measured2);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const measured2 = entries[0]?.contentRect.width ?? 0;
      if (measured2 > 0) setWidth(measured2);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, fallback]);
  return width;
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
function useBarPlan(block, width, mode) {
  const options = react.useMemo(() => chartOptionsFor(block), [block]);
  return react.useMemo(() => {
    if (!BAR_CHART_TYPES.has(block.chart_type)) return null;
    return planBarLayout({
      chartType: block.chart_type,
      xValues: block.data.map((row) => row[block.x.key]),
      orientation: options.orientation,
      width,
      mode,
      seriesCount: block.series.length,
      stacked: options.stacked ?? false,
      charPx: measureCharPx()
    });
  }, [block, options, width, mode]);
}
function ChartBlock({ block }) {
  const [expanded, setExpanded] = react.useState(false);
  const hostRef = react.useRef(null);
  const width = useElementWidth(hostRef, DEFAULT_CHART_WIDTH_PX);
  const plan = useBarPlan(block, width, "inline");
  const shownRows = plan?.horizontal ? plan.layout.shownRows : block.data.length;
  const inlineBlock = react.useMemo(
    () => shownRows < block.data.length ? { ...block, data: block.data.slice(0, shownRows) } : block,
    [block, shownRows]
  );
  const total = block.data.length;
  const shown = inlineBlock.data.length;
  const totalCount = block.total_count ?? total;
  const hasMoreThanEmbedded = totalCount > total;
  const showViewAll = shown < total;
  const title = (block.title ?? "").trim() || deriveTitle(block.x, block.series) || "Chart";
  const csvColumns = react.useMemo(
    () => [{ key: block.x.key, label: block.x.label }, ...block.series.map((s) => ({ key: s.key, label: s.label }))],
    [block.x, block.series]
  );
  const handleExport = react.useCallback(() => {
    downloadCsv(title, rowsToCsv(csvColumns, block.data));
  }, [title, block.data, csvColumns]);
  const openExpand = react.useCallback(() => setExpanded(true), []);
  const closeExpand = react.useCallback(() => setExpanded(false), []);
  return /* @__PURE__ */ jsxRuntime.jsxs(Card, { padding: "sm", children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "mb-3 flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxRuntime.jsx("h4", { className: "truncate text-sm font-semibold", style: { color: "var(--cx-text-primary)" }, children: title }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex shrink-0 items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntime.jsx(IconButton, { label: "Download CSV", onClick: handleExport, children: /* @__PURE__ */ jsxRuntime.jsx(DownloadIcon, {}) }),
        /* @__PURE__ */ jsxRuntime.jsx(IconButton, { label: "Expand chart", onClick: openExpand, children: /* @__PURE__ */ jsxRuntime.jsx(ExpandIcon, {}) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx(
      "div",
      {
        ref: hostRef,
        className: "w-full min-w-0",
        style: { height: plan?.horizontal ? plan.layout.hostHeight : VERTICAL_CHART_HEIGHT_PX },
        "data-cxc-shown": shown,
        "data-cxc-total": total,
        children: /* @__PURE__ */ jsxRuntime.jsx(ChartDispatch, { block: inlineBlock, mode: "inline", width, plan: plan ?? void 0 })
      }
    ),
    (showViewAll || hasMoreThanEmbedded) && // Every cut is printed. The renderer never drops a row silently, and
    // the wire order is kept — an ORDER BY ranking IS the answer.
    /* @__PURE__ */ jsxRuntime.jsxs(
      "div",
      {
        className: "mt-2 flex items-center gap-1.5 text-xs",
        style: { color: "var(--cx-text-muted)" },
        children: [
          /* @__PURE__ */ jsxRuntime.jsxs("span", { children: [
            "Showing ",
            shown,
            " of ",
            total,
            hasMoreThanEmbedded ? ` (${totalCount.toLocaleString()} total)` : ""
          ] }),
          showViewAll && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
            /* @__PURE__ */ jsxRuntime.jsx("span", { "aria-hidden": "true", children: "\xB7" }),
            /* @__PURE__ */ jsxRuntime.jsx(
              "button",
              {
                type: "button",
                onClick: openExpand,
                className: "font-medium hover:underline focus:outline-none focus-visible:ring-2",
                style: { color: "var(--cx-accent)" },
                children: "View all"
              }
            )
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(Dialog, { open: expanded, onClose: closeExpand, title, size: "lg", children: /* @__PURE__ */ jsxRuntime.jsx(ExpandedChart, { block }) })
  ] });
}
function ExpandedChart({ block }) {
  const hostRef = react.useRef(null);
  const width = useElementWidth(hostRef, EXPANDED_CHART_WIDTH_PX);
  const plan = useBarPlan(block, width, "expanded");
  return /* @__PURE__ */ jsxRuntime.jsx(
    "div",
    {
      ref: hostRef,
      className: "w-full min-w-0",
      style: plan?.horizontal ? { height: plan.layout.hostHeight } : (
        // A vertical chart cannot use its rows to earn height, so it takes a
        // share of the viewport with a floor for short laptop screens.
        { height: "60vh", minHeight: EXPANDED_VERTICAL_MIN_HEIGHT_PX }
      ),
      "data-cxc-shown": block.data.length,
      "data-cxc-total": block.data.length,
      children: /* @__PURE__ */ jsxRuntime.jsx(ChartDispatch, { block, mode: "expanded", width, plan: plan ?? void 0 })
    }
  );
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
  const { config, send, selectFollowup, submitFeedback, removeFeedback, editAndRegenerate, regenerateLast, speech, toggleSpeech } = useChatContext();
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
  const voiceEnabled = isAssistant && Boolean(config.voice) && Boolean(message.backendMessageId) && !isStreaming;
  const speechStatus = speech.messageId === message.id ? speech.status : "idle";
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
  const handleSpeakClick = react.useCallback(() => {
    toggleSpeech(message.id);
  }, [toggleSpeech, message.id]);
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
                onFeedback: feedbackEnabled ? handleFeedbackClick : void 0,
                speechStatus,
                speechError: speechStatus === "error" ? speech.error : void 0,
                onSpeak: voiceEnabled ? handleSpeakClick : void 0
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

// src/utils/wav.ts
var TARGET_SAMPLE_RATE = 16e3;
var WAV_CONTENT_TYPE = "audio/wav";
var DECODE_SAMPLE_RATE = 44100;
var WAV_HEADER_BYTES = 44;
var BYTES_PER_SAMPLE = 2;
var PCM_FORMAT = 1;
var MONO = 1;
function encodeWav(samples, sampleRate) {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset2, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset2 + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, MONO, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * MONO * BYTES_PER_SAMPLE, true);
  view.setUint16(32, MONO * BYTES_PER_SAMPLE, true);
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = WAV_HEADER_BYTES;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
    offset += BYTES_PER_SAMPLE;
  }
  return buffer;
}
function canConvertToWav() {
  return typeof OfflineAudioContext !== "undefined";
}
async function blobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const decodeContext = new OfflineAudioContext(MONO, 1, DECODE_SAMPLE_RATE);
  const decoded = await decodeContext.decodeAudioData(arrayBuffer);
  const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const renderContext = new OfflineAudioContext(MONO, frameCount, TARGET_SAMPLE_RATE);
  const source = renderContext.createBufferSource();
  source.buffer = decoded;
  source.connect(renderContext.destination);
  source.start();
  const rendered = await renderContext.startRendering();
  return new Blob([encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE)], {
    type: WAV_CONTENT_TYPE
  });
}

// src/hooks/use-voice-recorder.ts
async function convertForUpload(clip) {
  if (!canConvertToWav()) return clip;
  try {
    return await blobToWav(clip);
  } catch {
    return clip;
  }
}
function useVoiceRecorder({ onClip }) {
  const [status, setStatus] = react.useState("idle");
  const [error, setError] = react.useState(null);
  const [elapsedSeconds, setElapsedSeconds] = react.useState(0);
  const [limitReached, setLimitReached] = react.useState(false);
  const recorderRef = react.useRef(null);
  const streamRef = react.useRef(null);
  const chunksRef = react.useRef([]);
  const mountedRef = react.useRef(true);
  const onClipRef = react.useRef(onClip);
  react.useEffect(() => {
    onClipRef.current = onClip;
  }, [onClip]);
  const releaseStream = react.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);
  react.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      releaseStream();
    };
  }, [releaseStream]);
  react.useEffect(() => {
    if (status !== "recording") return;
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1e3);
      setElapsedSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS) {
        setLimitReached(true);
        recorderRef.current?.stop();
      }
    }, 1e3);
    return () => clearInterval(timer);
  }, [status]);
  const start = react.useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording is not supported in this browser");
      setStatus("error");
      return;
    }
    setError(null);
    setLimitReached(false);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone unavailable. Check your browser permissions.");
      setStatus("error");
      return;
    }
    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const mimeType = pickMimeType(getMimeSupportProbe());
    let recorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : void 0);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError("Recording is not supported in this browser");
      setStatus("error");
      return;
    }
    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      releaseStream();
      if (!mountedRef.current) return;
      setError("Recording failed. Please try again.");
      setStatus("error");
    };
    recorder.onstop = () => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      const clip = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      releaseStream();
      if (!mountedRef.current) return;
      if (clip.size === 0) {
        setError("Nothing was recorded. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("transcribing");
      void convertForUpload(clip).then((upload) => onClipRef.current(upload)).then(() => {
        if (mountedRef.current) setStatus("idle");
      }).catch((err) => {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : "Transcription failed");
        setStatus("error");
      });
    };
    recorder.start();
    setStatus("recording");
  }, [releaseStream]);
  const toggle = react.useCallback(() => {
    if (status === "recording") {
      recorderRef.current?.stop();
      return;
    }
    if (status === "transcribing") return;
    void start();
  }, [status, start]);
  const dismissError = react.useCallback(() => {
    setError(null);
    setStatus("idle");
  }, []);
  return { status, error, elapsedSeconds, limitReached, toggle, dismissError };
}
var LIMIT_WARNING_SECONDS = 10;
var SIZES = {
  sm: { box: "h-7 w-7", icon: 14 },
  md: { box: "h-8 w-8", icon: 16 },
  lg: { box: "h-9 w-9", icon: 18 }
};
var STATUS_MAX_WIDTH = 132;
function VoiceRecordButton({
  disabled,
  size = "md",
  appearance = "outline",
  onStatusChange,
  className
}) {
  const { config, state, setInput, dictate } = useChatContext();
  const voice = config.voice;
  const inputValueRef = react.useRef(state.inputValue);
  react.useEffect(() => {
    inputValueRef.current = state.inputValue;
  }, [state.inputValue]);
  const handleClip = react.useCallback(
    async (clip) => {
      if (!voice) return;
      const result = await dictate(clip);
      const text = result.text.trim();
      if (!text) return;
      const existing = inputValueRef.current.trimEnd();
      setInput(existing ? `${existing} ${text}` : text);
    },
    [voice, dictate, setInput]
  );
  const { status, error, elapsedSeconds, limitReached, toggle, dismissError } = useVoiceRecorder({
    onClip: handleClip
  });
  const onStatusChangeRef = react.useRef(onStatusChange);
  react.useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  });
  react.useEffect(() => {
    onStatusChangeRef.current?.(status);
  }, [status]);
  react.useEffect(() => () => onStatusChangeRef.current?.("idle"), []);
  if (!voice) return null;
  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";
  const hasError = status === "error";
  const isSolid = appearance === "solid";
  const { box: dimension, icon: iconSize } = SIZES[size];
  const secondsLeft = remainingSeconds(elapsedSeconds);
  const isNearLimit = isRecording && secondsLeft <= LIMIT_WARNING_SECONDS;
  const label = isRecording ? "Stop recording" : isTranscribing ? "Transcribing" : "Record a voice message";
  const alerting = isRecording || hasError;
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      className: cn(
        "flex items-center gap-1.5",
        // Solid means this button is in the send position at the right edge, so
        // the timer has to sit to its LEFT or it runs out of the container.
        isSolid && "flex-row-reverse",
        className
      ),
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            type: "button",
            onClick: hasError ? dismissError : toggle,
            disabled: disabled || isTranscribing || state.isStreaming,
            className: cn(
              "flex shrink-0 items-center justify-center rounded-full",
              dimension,
              isSolid ? "transition-all duration-150 active:scale-[0.96]" : "transition-colors duration-100",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-[var(--cxc-border-focus)]",
              "disabled:cursor-not-allowed",
              isSolid ? "disabled:opacity-30" : "disabled:opacity-40"
            ),
            style: isSolid ? {
              backgroundColor: alerting ? "var(--cxc-error)" : "var(--cxc-text)",
              color: "var(--cxc-text-inverse)"
            } : {
              color: alerting ? "var(--cxc-error)" : "var(--cxc-text-secondary)",
              border: `1px solid ${isRecording ? "var(--cxc-error)" : "var(--cxc-border)"}`
            },
            onMouseOver: (e) => {
              if (isSolid || alerting) return;
              e.currentTarget.style.backgroundColor = "var(--cxc-bg-muted)";
              e.currentTarget.style.color = "var(--cxc-text)";
            },
            onMouseOut: (e) => {
              if (isSolid || alerting) return;
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--cxc-text-secondary)";
            },
            "aria-label": hasError ? "Dismiss recording error" : label,
            "aria-pressed": isRecording,
            title: hasError ? error ?? "Recording failed" : label,
            children: isTranscribing ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Loader2, { size: iconSize, className: "cxc-spin", "aria-hidden": "true" }) : isRecording ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Square, { size: iconSize - 4, fill: "currentColor", "aria-hidden": "true" }) : /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Mic, { size: iconSize, strokeWidth: 1.8, "aria-hidden": "true" })
          }
        ),
        isRecording && /* @__PURE__ */ jsxRuntime.jsxs(
          "span",
          {
            className: "flex items-center gap-1.5 text-[12px] tabular-nums",
            style: { color: isNearLimit ? "var(--cxc-error)" : "var(--cxc-text-secondary)" },
            children: [
              /* @__PURE__ */ jsxRuntime.jsx(
                "span",
                {
                  className: "inline-block h-1.5 w-1.5 rounded-full",
                  style: { backgroundColor: "var(--cxc-error)" },
                  "aria-hidden": "true"
                }
              ),
              formatDuration(elapsedSeconds),
              isNearLimit && /* @__PURE__ */ jsxRuntime.jsxs("span", { children: [
                secondsLeft,
                "s left"
              ] })
            ]
          }
        ),
        isTranscribing && /* @__PURE__ */ jsxRuntime.jsx(
          "span",
          {
            className: "truncate text-[12px]",
            style: { color: "var(--cxc-text-muted)", maxWidth: STATUS_MAX_WIDTH },
            title: limitReached ? "Recording limit reached \u2014 transcribing..." : void 0,
            children: limitReached ? "Recording limit reached \u2014 transcribing..." : "Transcribing..."
          }
        ),
        hasError && error && /* @__PURE__ */ jsxRuntime.jsx(
          "span",
          {
            className: "truncate text-[12px]",
            style: { color: "var(--cxc-error)", maxWidth: STATUS_MAX_WIDTH },
            role: "alert",
            title: error,
            children: error
          }
        )
      ]
    }
  );
}
var PANEL_WIDTH = 280;
var PANEL_MAX_HEIGHT = 320;
var PANEL_EDGE_GAP = 8;
function LanguagePicker({ disabled, size = "md", className }) {
  const { config, dictation, dictationOptions, setDictationLanguage } = useChatContext();
  const [open, setOpen] = react.useState(false);
  const [query, setQuery] = react.useState("");
  const [activeIndex, setActiveIndex] = react.useState(0);
  const [shift, setShift] = react.useState(null);
  const rootRef = react.useRef(null);
  const triggerRef = react.useRef(null);
  const searchRef = react.useRef(null);
  const listRef = react.useRef(null);
  const panelRef = react.useRef(null);
  const baseId = react.useId();
  const listboxId = `${baseId}-listbox`;
  const reduceMotion = react$1.useReducedMotion();
  const candidates = config.voiceStatus?.autodetect_candidates;
  const selected = findOption(dictationOptions, dictation.language);
  const showAutodetect = dictation.autodetectAvailable;
  const sections = react.useMemo(() => {
    let index = 0;
    const row = (prefix, option) => ({
      key: `${prefix}-${option?.locale ?? "auto"}`,
      locale: option?.locale ?? null,
      option,
      index: index++
    });
    const autoRows = showAutodetect && matchesAutodetect(query) ? [row("auto")] : [];
    const trimmed = query.trim();
    if (trimmed) {
      const matches = filterLanguages(dictationOptions, trimmed);
      return [{ key: "results", rows: [...autoRows, ...matches.map((option) => row("r", option))] }];
    }
    const frequent = frequentOptions(dictationOptions, candidates);
    const browsing = [];
    if (autoRows.length) browsing.push({ key: "auto", rows: autoRows });
    const grouped = frequent.length > 0 && frequent.length < dictationOptions.length;
    if (grouped) {
      browsing.push({ key: "frequent", label: "Frequent", rows: frequent.map((option) => row("f", option)) });
    }
    browsing.push({
      key: "all",
      label: grouped ? "All languages" : void 0,
      rows: dictationOptions.map((option) => row("a", option))
    });
    return browsing;
  }, [dictationOptions, candidates, query, showAutodetect]);
  const rows = react.useMemo(() => sections.flatMap((section) => section.rows), [sections]);
  const activeRow = rows[activeIndex];
  const activeOptionId = activeRow ? `${baseId}-${activeRow.key}` : void 0;
  const close = react.useCallback((refocus) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  }, []);
  const choose = react.useCallback(
    (locale) => {
      setDictationLanguage(locale);
      close(true);
    },
    [setDictationLanguage, close]
  );
  const openPanel = react.useCallback(() => {
    const current = rows.findIndex((row) => row.locale === dictation.language);
    setActiveIndex(current >= 0 ? current : 0);
    setOpen(true);
  }, [rows, dictation.language]);
  const handleQueryChange = react.useCallback((value) => {
    setQuery(value);
    setActiveIndex(0);
  }, []);
  react.useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);
  react.useEffect(() => {
    if (!open) {
      setShift(null);
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;
    const bounds = rootRef.current?.closest(".cxc-root")?.getBoundingClientRect();
    const rect = panel.getBoundingClientRect();
    const right = bounds ? bounds.right : window.innerWidth;
    const left = bounds ? bounds.left : 0;
    const overflow = rect.right - (right - PANEL_EDGE_GAP);
    const room = Math.max(0, rect.left - (left + PANEL_EDGE_GAP));
    setShift(overflow > 0 ? -Math.min(overflow, room) : 0);
  }, [open]);
  react.useEffect(() => {
    if (!open) return;
    const handler = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) close(false);
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, close]);
  react.useEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    const row = list.querySelector('[data-active="true"]');
    if (!row) return;
    if (row.offsetTop < list.scrollTop) {
      list.scrollTop = row.offsetTop;
    } else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
    }
  }, [open, activeIndex, rows]);
  const handleSearchKeyDown = react.useCallback(
    (event) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          if (rows.length) setActiveIndex((index) => (index + 1) % rows.length);
          break;
        case "ArrowUp":
          event.preventDefault();
          if (rows.length) setActiveIndex((index) => (index - 1 + rows.length) % rows.length);
          break;
        case "Home":
          event.preventDefault();
          setActiveIndex(0);
          break;
        case "End":
          event.preventDefault();
          setActiveIndex(Math.max(0, rows.length - 1));
          break;
        case "Enter":
          event.preventDefault();
          if (activeRow) choose(activeRow.locale);
          break;
        case "Escape":
          event.preventDefault();
          event.stopPropagation();
          close(true);
          break;
        case "Tab":
          close(true);
          break;
      }
    },
    [rows.length, activeRow, choose, close]
  );
  const selectableCount = dictationOptions.length + (showAutodetect ? 1 : 0);
  if (!config.voice || dictationOptions.length === 0 || selectableCount < 2) return null;
  const triggerLabel = selected ? compactLabel(selected) : "Auto";
  const triggerTitle = selected ? `Dictation language: ${selected.englishName}` : "Dictation language: auto-detect";
  const dimension = size === "sm" ? "h-7" : "h-8";
  const iconSize = size === "sm" ? 13 : 14;
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { ref: rootRef, className: cn("relative flex items-center", className), children: [
    /* @__PURE__ */ jsxRuntime.jsxs(
      "button",
      {
        ref: triggerRef,
        type: "button",
        onClick: () => open ? close(false) : openPanel(),
        disabled,
        className: cn(
          "flex shrink-0 items-center gap-1 rounded-full px-2",
          dimension,
          "text-[12px] leading-none",
          "transition-colors duration-100",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-[var(--cxc-border-focus)]",
          "disabled:cursor-not-allowed disabled:opacity-40"
        ),
        style: {
          color: open ? "var(--cxc-text)" : "var(--cxc-text-secondary)",
          border: "1px solid var(--cxc-border)",
          backgroundColor: open ? "var(--cxc-bg-muted)" : "transparent"
        },
        onMouseOver: (e) => {
          if (open) return;
          e.currentTarget.style.backgroundColor = "var(--cxc-bg-muted)";
          e.currentTarget.style.color = "var(--cxc-text)";
        },
        onMouseOut: (e) => {
          if (open) return;
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--cxc-text-secondary)";
        },
        "aria-haspopup": "listbox",
        "aria-expanded": open,
        "aria-label": triggerTitle,
        title: triggerTitle,
        children: [
          /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Globe, { size: iconSize, strokeWidth: 1.8, "aria-hidden": "true" }),
          /* @__PURE__ */ jsxRuntime.jsx("span", { className: "max-w-[72px] truncate", children: triggerLabel })
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { children: open && /* @__PURE__ */ jsxRuntime.jsxs(
      react$1.motion.div,
      {
        ref: panelRef,
        initial: reduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 },
        transition: { duration: reduceMotion ? 0 : 0.14, ease: [0.25, 0.1, 0.25, 1] },
        onKeyDown: (e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close(true);
          }
        },
        className: "absolute bottom-full z-50 mb-2 flex flex-col overflow-hidden rounded-[var(--cxc-radius-lg)] shadow-lg",
        style: {
          // Opens upward: the input sits at the bottom of the widget, so a
          // downward panel would spill straight out of the container.
          left: shift ?? 0,
          // Hidden for the one frame before the nudge is measured, so the
          // panel never appears in the wrong place — including for readers
          // who have animation turned off.
          visibility: shift === null ? "hidden" : "visible",
          width: `min(${PANEL_WIDTH}px, calc(100vw - 2rem))`,
          maxHeight: PANEL_MAX_HEIGHT,
          backgroundColor: "var(--cxc-bg)",
          border: "1px solid var(--cxc-border)"
        },
        children: [
          /* @__PURE__ */ jsxRuntime.jsxs(
            "div",
            {
              className: "flex shrink-0 items-center gap-2 px-3 py-2",
              style: { borderBottom: "1px solid var(--cxc-border-subtle)" },
              children: [
                /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Search, { size: 14, strokeWidth: 1.8, style: { color: "var(--cxc-text-muted)" }, "aria-hidden": "true" }),
                /* @__PURE__ */ jsxRuntime.jsx(
                  "input",
                  {
                    ref: searchRef,
                    type: "text",
                    role: "combobox",
                    value: query,
                    onChange: (e) => handleQueryChange(e.target.value),
                    onKeyDown: handleSearchKeyDown,
                    placeholder: "Search languages",
                    autoComplete: "off",
                    spellCheck: false,
                    "aria-label": "Search dictation languages",
                    "aria-expanded": true,
                    "aria-controls": listboxId,
                    "aria-autocomplete": "list",
                    "aria-activedescendant": activeOptionId,
                    className: cn(
                      "w-full bg-transparent text-[13px] leading-5 outline-none",
                      "placeholder:text-[var(--cxc-text-muted)]"
                    ),
                    style: { color: "var(--cxc-text)" }
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsxs(
            "div",
            {
              ref: listRef,
              id: listboxId,
              role: "listbox",
              "aria-label": "Dictation language",
              className: "relative min-h-0 flex-1 overflow-y-auto overscroll-contain py-1",
              children: [
                rows.length === 0 && /* @__PURE__ */ jsxRuntime.jsx("p", { className: "px-3 py-4 text-center text-[12px]", style: { color: "var(--cxc-text-muted)" }, children: "No languages match" }),
                sections.map((section) => /* @__PURE__ */ jsxRuntime.jsxs("div", { children: [
                  section.label && /* @__PURE__ */ jsxRuntime.jsx(
                    "p",
                    {
                      className: "px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide",
                      style: { color: "var(--cxc-text-muted)" },
                      "aria-hidden": "true",
                      children: section.label
                    }
                  ),
                  section.rows.map((row) => {
                    const isActive = row.index === activeIndex;
                    const isSelected = row.locale === dictation.language;
                    const secondary = row.option ? secondaryLabel(row.option) : "";
                    return /* @__PURE__ */ jsxRuntime.jsxs(
                      "div",
                      {
                        id: `${baseId}-${row.key}`,
                        role: "option",
                        "aria-selected": isSelected,
                        "aria-label": row.option ? `${row.option.nativeName} \u2014 ${row.option.englishName}` : void 0,
                        "data-active": isActive,
                        onClick: () => choose(row.locale),
                        onMouseMove: () => {
                          if (row.index !== activeIndex) setActiveIndex(row.index);
                        },
                        className: "flex cursor-pointer items-baseline gap-1.5 px-3 py-1.5",
                        style: { backgroundColor: isActive ? "var(--cxc-bg-muted)" : "transparent" },
                        children: [
                          /* @__PURE__ */ jsxRuntime.jsx(
                            "span",
                            {
                              className: "max-w-[60%] shrink-0 truncate text-[13px]",
                              style: { color: "var(--cxc-text)" },
                              children: row.option ? row.option.nativeName : "Auto-detect"
                            }
                          ),
                          secondary && /* @__PURE__ */ jsxRuntime.jsx(
                            "span",
                            {
                              className: "min-w-0 flex-1 truncate text-[11px]",
                              style: { color: "var(--cxc-text-muted)" },
                              children: secondary
                            }
                          ),
                          isSelected && /* @__PURE__ */ jsxRuntime.jsx(
                            lucideReact.Check,
                            {
                              size: 13,
                              strokeWidth: 2.2,
                              className: "ml-auto shrink-0 self-center",
                              style: { color: "var(--cxc-text)" },
                              "aria-hidden": "true"
                            }
                          )
                        ]
                      },
                      row.key
                    );
                  })
                ] }, section.key))
              ]
            }
          )
        ]
      }
    ) })
  ] });
}
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
  const [recorderStatus, setRecorderStatus] = react.useState("idle");
  const dragCounter = react.useRef(0);
  const reduceMotion = react$1.useReducedMotion();
  const resolvedPlaceholder = placeholder ?? config.placeholder ?? "Message...";
  const maxLength = config.maxInputLength ?? 1e4;
  const isStreaming = state.isStreaming;
  const inputValue = state.inputValue;
  const isDisabled = disabled || false;
  const hasText = inputValue.trim().length > 0;
  const canSend = hasText && !isStreaming && !isDisabled;
  const showCharCount = inputValue.length > maxLength * 0.9;
  const isOverLimit = inputValue.length > maxLength;
  const isRecorderBusy = recorderStatus !== "idle";
  const showMic = Boolean(config.voice) && !isStreaming && (isRecorderBusy || !hasText);
  const showSuggestions = suggestions && suggestions.length > 0 && !inputValue && !isStreaming && !isRecorderBusy;
  const swap = react.useMemo(
    () => ({
      initial: { scale: 0.85, opacity: 0 },
      animate: { scale: 1, opacity: 1 },
      exit: { scale: 0.85, opacity: 0 },
      transition: { duration: reduceMotion ? 0 : 0.12, ease: "easeOut" }
    }),
    [reduceMotion]
  );
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
              /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center justify-between gap-2 px-3 pb-3 pt-1", children: [
                /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex min-w-0 items-center gap-1", children: [
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
                /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex shrink-0 items-center gap-1.5", children: [
                  /* @__PURE__ */ jsxRuntime.jsx(LanguagePicker, { disabled: isDisabled }),
                  /* @__PURE__ */ jsxRuntime.jsx("div", { className: "relative flex min-h-9 min-w-9 items-center justify-end", children: /* @__PURE__ */ jsxRuntime.jsx(react$1.AnimatePresence, { mode: "wait", initial: false, children: showMic ? /* @__PURE__ */ jsxRuntime.jsx(react$1.motion.div, { ...swap, children: /* @__PURE__ */ jsxRuntime.jsx(
                    VoiceRecordButton,
                    {
                      disabled: isDisabled,
                      size: "lg",
                      appearance: "solid",
                      onStatusChange: setRecorderStatus
                    }
                  ) }, "mic") : /* @__PURE__ */ jsxRuntime.jsx(
                    react$1.motion.button,
                    {
                      ...swap,
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
                  ) }) })
                ] })
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
              /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex shrink-0 items-center gap-1 pb-0.5", children: [
                /* @__PURE__ */ jsxRuntime.jsx(VoiceRecordButton, { disabled: isDisabled, size: "sm" }),
                /* @__PURE__ */ jsxRuntime.jsx(LanguagePicker, { disabled: isDisabled, size: "sm" })
              ] }),
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
exports.LanguagePicker = LanguagePicker;
exports.MAX_RECORDING_SECONDS = MAX_RECORDING_SECONDS;
exports.MessageActionBar = MessageActionBar;
exports.MessageList = MessageList;
exports.ModeSwitch = ModeSwitch;
exports.PromptInput = PromptInput;
exports.SessionList = SessionList;
exports.SessionSelector = SessionSelector;
exports.StreamingText = StreamingText;
exports.TARGET_SAMPLE_RATE = TARGET_SAMPLE_RATE;
exports.TextShimmer = TextShimmer;
exports.ThinkingIndicator = ThinkingIndicator;
exports.VoiceRecordButton = VoiceRecordButton;
exports.WAV_CONTENT_TYPE = WAV_CONTENT_TYPE;
exports.blobToWav = blobToWav;
exports.canConvertToWav = canConvertToWav;
exports.cn = cn;
exports.encodeWav = encodeWav;
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
exports.useVoiceRecorder = useVoiceRecorder;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map