import {
  getSessionMessages,
  listSessions,
  listSubagents,
} from '@anthropic-ai/claude-agent-sdk'

import type {
  ClaudeSourceWorkerRequest,
  ClaudeSourceWorkerResponse,
} from './claude-worker-protocol'

delete process.env.CLAUDE_CONFIG_DIR
delete process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR

process.on('message', (request: ClaudeSourceWorkerRequest) => {
  void handleRequest(request)
})

async function handleRequest(request: ClaudeSourceWorkerRequest): Promise<void> {
  try {
    const result = request.operation === 'list-sessions'
      ? await listSessions(request.options)
      : request.operation === 'get-session-messages'
        ? await getSessionMessages(request.sessionId, request.options)
        : await listSubagents(request.sessionId)
    send({ id: request.id, ok: true, result })
  }
  catch (error) {
    send({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function send(response: ClaudeSourceWorkerResponse): void {
  if (process.send) {
    process.send(response, () => process.disconnect())
  }
}
