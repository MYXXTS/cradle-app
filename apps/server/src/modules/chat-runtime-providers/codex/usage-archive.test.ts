import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readCodexArchiveUsage } from './usage-archive'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('readCodexArchiveUsage', () => {
  it('uses the final cumulative token count without double-counting token subsets', async () => {
    const path = writeArchive([
      {
        timestamp: '2026-07-14T01:00:00.000Z',
        type: 'session_meta',
        payload: { id: 'session-1' },
      },
      tokenCount('2026-07-14T01:01:00.000Z', {
        input_tokens: 100,
        cached_input_tokens: 80,
        output_tokens: 20,
        reasoning_output_tokens: 15,
        total_tokens: 120,
      }),
      tokenCount('2026-07-14T01:02:00.000Z', {
        input_tokens: 250,
        cached_input_tokens: 200,
        output_tokens: 50,
        reasoning_output_tokens: 40,
        total_tokens: 300,
      }),
    ], '{"type":"event_msg"')

    await expect(readCodexArchiveUsage(path)).resolves.toEqual({
      sessionId: 'session-1',
      occurredAt: Date.parse('2026-07-14T01:02:00.000Z'),
      usage: {
        inputTokens: 250,
        cachedInputTokens: 200,
        outputTokens: 50,
        reasoningOutputTokens: 40,
        totalTokens: 300,
      },
    })
  })

  it('falls back to input plus output when the native total is absent', async () => {
    const path = writeArchive([
      tokenCount('2026-07-14T02:00:00.000Z', {
        input_tokens: 12,
        cached_input_tokens: 8,
        output_tokens: 3,
        reasoning_output_tokens: 2,
      }),
    ])

    await expect(readCodexArchiveUsage(path)).resolves.toMatchObject({
      usage: {
        inputTokens: 12,
        cachedInputTokens: 8,
        outputTokens: 3,
        reasoningOutputTokens: 2,
        totalTokens: 15,
      },
    })
  })

  it('returns null when the archive has no valid token count', async () => {
    const path = writeArchive([
      { timestamp: 'invalid', type: 'event_msg', payload: { type: 'token_count', info: {} } },
      { timestamp: '2026-07-14T03:00:00.000Z', type: 'event_msg', payload: { type: 'agent_message' } },
    ], '{not-json')

    await expect(readCodexArchiveUsage(path)).resolves.toBeNull()
  })
})

function tokenCount(timestamp: string, totalTokenUsage: Record<string, number>) {
  return {
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: totalTokenUsage },
    },
  }
}

function writeArchive(records: object[], trailingLine?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cradle-codex-usage-'))
  tempDirs.push(dir)
  const path = join(dir, 'rollout.jsonl')
  const lines = records.map(record => JSON.stringify(record))
  if (trailingLine !== undefined) {
    lines.push(trailingLine)
  }
  writeFileSync(path, lines.join('\n'))
  return path
}
