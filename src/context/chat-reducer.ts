import type { ChatAction, ChatMessage, ChatReducerAction, ChatState } from '../types'

export const initialChatState: ChatState = {
  messages: [],
  isStreaming: false,
  activeSessionId: null,
  sessions: [],
  inputValue: '',
  error: null,
  connectionStatus: 'idle',
}

/**
 * Recursively updates an action's status within a nested action tree.
 * Returns a new array if the action was found and updated, or the original array otherwise.
 */
function updateActionInTree(
  actions: ChatAction[],
  actionId: string,
  status: ChatAction['status'],
  detail?: string
): ChatAction[] {
  return actions.map((action) => {
    if (action.id === actionId) {
      return { ...action, status, detail: detail ?? action.detail }
    }
    if (action.children && action.children.length > 0) {
      const updatedChildren = updateActionInTree(action.children, actionId, status, detail)
      if (updatedChildren !== action.children) {
        return { ...action, children: updatedChildren }
      }
    }
    return action
  })
}

/**
 * Updates a specific message in the messages array by ID.
 * Uses an updater function to produce the new message.
 */
function updateMessage(
  messages: ChatMessage[],
  messageId: string,
  updater: (msg: ChatMessage) => ChatMessage
): ChatMessage[] {
  return messages.map((msg) => (msg.id === messageId ? updater(msg) : msg))
}

export function chatReducer(state: ChatState, action: ChatReducerAction): ChatState {
  switch (action.type) {
    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.message],
        error: null,
      }

    case 'ADD_ASSISTANT_PLACEHOLDER':
      return {
        ...state,
        messages: [...state.messages, action.message],
      }

    case 'APPEND_TOKEN':
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          content: msg.content + action.text,
        })),
      }

    case 'APPEND_REASONING':
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          reasoning: (msg.reasoning ?? '') + action.text,
        })),
      }

    case 'ADD_ACTION':
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          actions: [...(msg.actions ?? []), action.action],
        })),
      }

    case 'UPDATE_ACTION':
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          actions: msg.actions
            ? updateActionInTree(msg.actions, action.actionId, action.status, action.detail)
            : [],
        })),
      }

    case 'SET_FOLLOWUPS':
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          followups: action.followups,
        })),
      }

    case 'LOCK_FOLLOWUPS':
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          followupsSelection: action.selection,
        })),
      }

    case 'SET_FEEDBACK':
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          feedback: action.feedback,
        })),
      }

    case 'FINALIZE_MESSAGE':
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          isStreaming: false,
          // Capture the backend's persisted message id so feedback / regen
          // can target this turn after streaming completes.
          backendMessageId: action.backendMessageId ?? msg.backendMessageId,
          // Auto-complete any running/pending actions when the message finalizes
          actions: msg.actions?.map((a) =>
            a.status === 'running' || a.status === 'pending'
              ? { ...a, status: 'completed' as const }
              : a
          ),
        })),
        activeSessionId: action.sessionId ?? state.activeSessionId,
      }

    case 'TRIM_LAST_PAIR': {
      // Walk from the end, drop the last assistant + last user pair (or just the
      // lone trailing user / assistant if the pair is broken). Mirrors the
      // server-side trim that fires when regenerate=true is sent.
      const msgs = state.messages
      const last = msgs[msgs.length - 1]
      if (!last) return state
      let dropCount = 1
      if (last.role === 'assistant' && msgs.length >= 2 && msgs[msgs.length - 2].role === 'user') {
        dropCount = 2
      } else if (last.role === 'user' && msgs.length >= 2 && msgs[msgs.length - 2].role === 'assistant') {
        // Lone trailing user: drop only the user.
        dropCount = 1
      }
      return {
        ...state,
        messages: msgs.slice(0, msgs.length - dropCount),
      }
    }

    case 'SET_ERROR':
      return {
        ...state,
        messages: updateMessage(state.messages, action.messageId, (msg) => ({
          ...msg,
          error: true,
          isStreaming: false,
          content: msg.content || action.error,
        })),
        error: action.error,
      }

    case 'SET_MESSAGES':
      return {
        ...state,
        messages: action.messages,
      }

    case 'SET_STREAMING':
      return {
        ...state,
        isStreaming: action.isStreaming,
      }

    case 'SET_SESSION':
      return {
        ...state,
        activeSessionId: action.sessionId,
      }

    case 'SET_SESSIONS':
      return {
        ...state,
        sessions: action.sessions,
      }

    case 'REMOVE_SESSION': {
      const isActive = state.activeSessionId === action.sessionId
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.sessionId),
        activeSessionId: isActive ? null : state.activeSessionId,
        messages: isActive ? [] : state.messages,
      }
    }

    case 'SET_INPUT':
      return {
        ...state,
        inputValue: action.value,
      }

    case 'SET_CONNECTION_STATUS':
      return {
        ...state,
        connectionStatus: action.status,
      }

    case 'RESET':
      return {
        ...state,
        messages: [],
        activeSessionId: null,
        isStreaming: false,
        inputValue: '',
        error: null,
        connectionStatus: 'idle',
      }

    default:
      return state
  }
}
