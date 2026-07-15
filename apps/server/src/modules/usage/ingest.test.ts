import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { sessions, usageLogs } from '@cradle/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db, shutdownInfra } from '../../infra'
import { recordRuntimeUsageEvent } from './ingest'

const previousDataDir = process.env.CRADLE_DATA_DIR
let dataDir = ''

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'cradle-usage-ingest-'))
  process.env.CRADLE_DATA_DIR = dataDir
})

afterEach(() => {
  shutdownInfra()
  rmSync(dataDir, { recursive: true, force: true })
  if (previousDataDir === undefined) {
    delete process.env.CRADLE_DATA_DIR
  }
  else {
    process.env.CRADLE_DATA_DIR = previousDataDir
  }
})

describe('recordRuntimeUsageEvent', () => {
  it('persists a complete provider event exactly once', () => {
    db().insert(sessions).values({ id: 'session-1', title: 'Session', runtimeKind: 'codex' }).run()
    const input = {
      event: {
        id: 'event-1',
        providerThreadId: 'thread-1',
        providerTurnId: 'turn-1',
        modelId: 'gpt-5.6-sol',
        occurredAt: 1_789_000_000,
        usage: {
          promptTokens: 200,
          cachedInputTokens: 180,
          completionTokens: 30,
          reasoningOutputTokens: 10,
          totalTokens: 230,
        },
        providerTotal: {
          promptTokens: 500,
          cachedInputTokens: 400,
          completionTokens: 50,
          reasoningOutputTokens: 20,
          totalTokens: 550,
        },
      },
      sessionId: 'session-1',
      runId: 'run-1',
      messageId: null,
      providerTargetId: null,
      providerSessionId: 'root-thread',
    }

    expect(recordRuntimeUsageEvent(input)).toBe('inserted')
    expect(recordRuntimeUsageEvent(input)).toBe('duplicate')
    expect(db().select().from(usageLogs).where(eq(usageLogs.id, 'event-1')).all()).toEqual([expect.objectContaining({
      runId: 'run-1',
      sessionId: 'session-1',
      providerSessionId: 'root-thread',
      providerThreadId: 'thread-1',
      providerTurnId: 'turn-1',
      modelId: 'gpt-5.6-sol',
      promptTokens: 200,
      cachedInputTokens: 180,
      completionTokens: 30,
      reasoningOutputTokens: 10,
      totalTokens: 230,
      providerTotalPromptTokens: 500,
      providerTotalTokens: 550,
      createdAt: 1_789_000_000,
    })])
  })

  it('rejects missing required provider identity', () => {
    expect(() => recordRuntimeUsageEvent({
      event: {
        id: 'event-1',
        providerThreadId: 'thread-1',
        providerTurnId: '',
        modelId: 'gpt-5.6-sol',
        occurredAt: 1,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        providerTotal: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      },
      sessionId: 'session-1',
      runId: null,
      messageId: null,
      providerTargetId: null,
      providerSessionId: 'root-thread',
    })).toThrow('providerTurnId')
  })
})
