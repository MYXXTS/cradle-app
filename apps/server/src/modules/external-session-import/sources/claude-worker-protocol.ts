import type {
  GetSessionMessagesOptions,
  ListSessionsOptions,
  SDKSessionInfo,
  SessionMessage,
} from '@anthropic-ai/claude-agent-sdk'

export type ClaudeSourceWorkerRequest
  = | { id: string, operation: 'list-sessions', options?: ListSessionsOptions }
    | { id: string, operation: 'get-session-messages', sessionId: string, options?: GetSessionMessagesOptions }
    | { id: string, operation: 'list-subagents', sessionId: string }

export type ClaudeSourceWorkerResult = SDKSessionInfo[] | SessionMessage[] | string[]

export type ClaudeSourceWorkerResponse
  = | { id: string, ok: true, result: ClaudeSourceWorkerResult }
    | { id: string, ok: false, error: string }
