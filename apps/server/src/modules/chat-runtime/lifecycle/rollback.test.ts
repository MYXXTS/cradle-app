import type { messages } from '@cradle/db'
import { describe, expect, it } from 'vitest'

import { shouldRollbackProviderTurn } from './rollback'

type MessageRow = typeof messages.$inferSelect

function message(input: {
  id: string
  role: 'user' | 'assistant'
  status: MessageRow['status']
  content?: string
  parts?: unknown[]
}): MessageRow {
  return {
    id: input.id,
    sessionId: 'session-1',
    parentMessageId: null,
    parentToolCallId: null,
    taskId: null,
    depth: 0,
    role: input.role,
    status: input.status,
    content: input.content ?? '',
    messageJson: JSON.stringify({
      id: input.id,
      role: input.role,
      parts: input.parts ?? [],
    }),
    errorText: null,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('shouldRollbackProviderTurn', () => {
  it('skips provider rollback for an empty failed assistant placeholder', () => {
    expect(shouldRollbackProviderTurn([
      message({ id: 'user-1', role: 'user', status: 'complete', content: 'retry' }),
      message({ id: 'assistant-1', role: 'assistant', status: 'failed' }),
    ])).toBe(false)
  })

  it('requires provider rollback when the failed assistant has projected content', () => {
    expect(shouldRollbackProviderTurn([
      message({ id: 'user-1', role: 'user', status: 'complete', content: 'retry' }),
      message({
        id: 'assistant-1',
        role: 'assistant',
        status: 'failed',
        content: 'partial',
        parts: [{ type: 'text', text: 'partial' }],
      }),
    ])).toBe(true)
  })

  it('requires provider rollback for completed assistant turns', () => {
    expect(shouldRollbackProviderTurn([
      message({ id: 'user-1', role: 'user', status: 'complete', content: 'retry' }),
      message({ id: 'assistant-1', role: 'assistant', status: 'complete' }),
    ])).toBe(true)
  })
})
