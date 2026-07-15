import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Thread } from '../app-server-protocol/v2/Thread'
import type { ThreadListResponse } from '../app-server-protocol/v2/ThreadListResponse'
import type { CodexAppServerClientLike } from '../types'
import { readCodexSessionTreeUsage } from './session-tree-usage'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('readCodexSessionTreeUsage', () => {
  it('returns zero usage when the root has no descendants', async () => {
    const client = createClient(() => page([]))

    await expect(readCodexSessionTreeUsage(client, 'root', { sessionRoots: [] })).resolves.toEqual({
      subagentCount: 0,
      subagentTotal: zeroUsage(),
    })
    expect(client.request).toHaveBeenCalledTimes(2)
  })

  it('aggregates direct and nested descendant archives', async () => {
    const child = thread('child', writeArchive('child', {
      input_tokens: 100,
      cached_input_tokens: 80,
      output_tokens: 20,
      reasoning_output_tokens: 10,
      total_tokens: 120,
    }))
    const grandchild = thread('grandchild', writeArchive('grandchild', {
      input_tokens: 50,
      cached_input_tokens: 30,
      output_tokens: 15,
      reasoning_output_tokens: 5,
      total_tokens: 65,
    }))
    const client = createClient((_method, params) => params.archived ? page([]) : page([child, grandchild]))

    await expect(readCodexSessionTreeUsage(client, 'root', { sessionRoots: tempDirs })).resolves.toEqual({
      subagentCount: 2,
      subagentTotal: {
        inputTokens: 150,
        cachedInputTokens: 110,
        outputTokens: 35,
        reasoningOutputTokens: 15,
        totalTokens: 185,
      },
    })
    expect(client.request).toHaveBeenCalledWith('thread/list', expect.objectContaining({
      ancestorThreadId: 'root',
      sourceKinds: ['subAgent', 'subAgentReview', 'subAgentCompact', 'subAgentThreadSpawn', 'subAgentOther'],
    }))
  })

  it('merges archived pages, de-duplicates thread IDs, and stops on a repeated cursor', async () => {
    const active = thread('active', writeArchive('active', { input_tokens: 10, output_tokens: 2, total_tokens: 12 }))
    const archived = thread('archived', writeArchive('archived', { input_tokens: 20, output_tokens: 3, total_tokens: 23 }))
    const client = createClient((_method, params) => {
      if (!params.archived) {
        return params.cursor === null
          ? page([active], 'active-next')
          : page([active], 'active-next')
      }
      return page([active, archived])
    })

    await expect(readCodexSessionTreeUsage(client, 'root', { sessionRoots: tempDirs })).resolves.toEqual({
      subagentCount: 2,
      subagentTotal: {
        inputTokens: 30,
        cachedInputTokens: 0,
        outputTokens: 5,
        reasoningOutputTokens: 0,
        totalTokens: 35,
      },
    })
    expect(client.request).toHaveBeenCalledTimes(3)
  })

  it('counts descendants whose archive is not available without inventing usage', async () => {
    const client = createClient((_method, params) => params.archived
      ? page([])
      : page([thread('ephemeral', null)]))

    await expect(readCodexSessionTreeUsage(client, 'root', { sessionRoots: [] })).resolves.toEqual({
      subagentCount: 1,
      subagentTotal: zeroUsage(),
    })
  })

  it('prefers the latest live cumulative total for a listed descendant', async () => {
    const child = thread('child', writeArchive('child', {
      input_tokens: 10,
      output_tokens: 2,
      total_tokens: 12,
    }))
    const client = createClient((_method, params) => params.archived ? page([]) : page([child]))
    const liveUsageByThreadId = new Map([
      ['child', { inputTokens: 40, cachedInputTokens: 30, outputTokens: 5, reasoningOutputTokens: 3, totalTokens: 45 }],
      ['unrelated', { inputTokens: 500, cachedInputTokens: 0, outputTokens: 50, reasoningOutputTokens: 0, totalTokens: 550 }],
    ])

    await expect(readCodexSessionTreeUsage(client, 'root', {
      liveUsageByThreadId,
      sessionRoots: tempDirs,
    })).resolves.toEqual({
      subagentCount: 1,
      subagentTotal: {
        inputTokens: 40,
        cachedInputTokens: 30,
        outputTokens: 5,
        reasoningOutputTokens: 3,
        totalTokens: 45,
      },
    })
  })

  it('does not read archive paths outside the configured session roots', async () => {
    const child = thread('child', writeArchive('child', {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
    }))
    const client = createClient((_method, params) => params.archived ? page([]) : page([child]))

    await expect(readCodexSessionTreeUsage(client, 'root', { sessionRoots: [] })).resolves.toEqual({
      subagentCount: 1,
      subagentTotal: zeroUsage(),
    })
  })
})

interface ThreadListParams {
  archived: boolean
  cursor: string | null
}

function createClient(readPage: (method: string, params: ThreadListParams) => ThreadListResponse): CodexAppServerClientLike {
  return {
    initialize: vi.fn(async () => {}),
    request: vi.fn(async (method, params) => {
      if (method !== 'thread/list') {
        throw new Error(`Unexpected method: ${method}`)
      }
      return readPage(method, params as ThreadListParams)
    }),
    nextNotification: vi.fn(async () => null),
    close: vi.fn(),
  }
}

function page(data: Thread[], nextCursor: string | null = null): ThreadListResponse {
  return { data, nextCursor, backwardsCursor: null }
}

function thread(id: string, path: string | null): Thread {
  return {
    id,
    extra: null,
    sessionId: 'session-tree',
    forkedFromId: null,
    parentThreadId: 'root',
    preview: '',
    ephemeral: path === null,
    historyMode: 'paginated',
    modelProvider: 'openai',
    createdAt: 0,
    updatedAt: 0,
    recencyAt: null,
    status: { type: 'notLoaded' },
    path,
    cwd: '/tmp',
    cliVersion: 'test',
    source: {
      subAgent: {
        thread_spawn: {
          parent_thread_id: 'root',
          depth: 1,
          agent_path: null,
          agent_nickname: null,
          agent_role: null,
        },
      },
    },
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
  }
}

function writeArchive(id: string, totalTokenUsage: Record<string, number>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cradle-codex-tree-'))
  tempDirs.push(dir)
  const path = join(dir, `${id}.jsonl`)
  writeFileSync(path, JSON.stringify({
    timestamp: '2026-07-14T01:00:00.000Z',
    type: 'event_msg',
    payload: { type: 'token_count', info: { total_token_usage: totalTokenUsage } },
  }))
  return path
}

function zeroUsage() {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 }
}
