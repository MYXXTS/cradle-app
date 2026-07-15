import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readClaudeArchiveUsage } from './usage-archive'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('readClaudeArchiveUsage', () => {
  it('aggregates unique assistant and tool-result usage with cache arithmetic', async () => {
    const assistant = {
      type: 'assistant',
      sessionId: 'session-1',
      requestId: 'request-1',
      timestamp: '2026-07-14T01:00:00.000Z',
      message: {
        id: 'message-1',
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 4,
          cache_read_input_tokens: 6,
          output_tokens: 3,
        },
      },
    }
    const path = writeArchive([
      assistant,
      { ...assistant, timestamp: '2026-07-14T01:01:00.000Z' },
      {
        type: 'user',
        sessionId: 'session-1',
        uuid: 'tool-result-1',
        timestamp: '2026-07-14T01:02:00.000Z',
        toolUseResult: {
          agentId: 'agent-1',
          usage: {
            input_tokens: 7,
            cache_creation_input_tokens: 2,
            cache_read_input_tokens: 5,
            output_tokens: 4,
          },
        },
      },
    ], '{broken-json')

    await expect(readClaudeArchiveUsage(path)).resolves.toEqual({
      sessionId: 'session-1',
      occurredAt: Date.parse('2026-07-14T01:02:00.000Z'),
      usage: {
        inputTokens: 34,
        cachedInputTokens: 11,
        outputTokens: 7,
        reasoningOutputTokens: 0,
        totalTokens: 41,
      },
    })
  })

  it('keeps assistant and tool-result identities in separate namespaces', async () => {
    const path = writeArchive([
      {
        type: 'assistant',
        sessionId: 'session-2',
        requestId: 'shared-id',
        timestamp: '2026-07-14T02:00:00.000Z',
        message: { usage: { input_tokens: 10, output_tokens: 1 } },
      },
      {
        type: 'user',
        sessionId: 'session-2',
        requestId: 'shared-id',
        timestamp: '2026-07-14T02:01:00.000Z',
        toolUseResult: { usage: { input_tokens: 20, output_tokens: 2 } },
      },
    ])

    await expect(readClaudeArchiveUsage(path)).resolves.toMatchObject({
      occurredAt: Date.parse('2026-07-14T02:01:00.000Z'),
      usage: { inputTokens: 30, outputTokens: 3, totalTokens: 33 },
    })
  })

  it('returns null when the transcript has no usage samples', async () => {
    const path = writeArchive([
      { type: 'assistant', sessionId: 'session-3', message: { content: [] } },
      { type: 'user', toolUseResult: { status: 'complete' } },
    ], 'not-json')

    await expect(readClaudeArchiveUsage(path)).resolves.toBeNull()
  })
})

function writeArchive(records: object[], trailingLine?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cradle-claude-usage-'))
  tempDirs.push(dir)
  const path = join(dir, 'transcript.jsonl')
  const lines = records.map(record => JSON.stringify(record))
  if (trailingLine !== undefined) {
    lines.push(trailingLine)
  }
  writeFileSync(path, lines.join('\n'))
  return path
}
