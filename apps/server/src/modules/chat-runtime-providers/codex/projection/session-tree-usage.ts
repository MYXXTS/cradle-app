import type { RuntimeTokenUsageBreakdown } from '@cradle/chat-runtime-contracts'

import type { Thread } from '../app-server-protocol/v2/Thread'
import type { ThreadListResponse } from '../app-server-protocol/v2/ThreadListResponse'
import type { CodexAppServerClientLike } from '../types'
import { readCodexArchiveUsage } from '../usage-archive'
import { discoverCodexSessionRoots, resolveCodexArchivePath } from '../usage-roots'

export interface CodexSessionTreeUsage {
  subagentTotal: RuntimeTokenUsageBreakdown
  subagentCount: number
}

export async function readCodexSessionTreeUsage(
  client: CodexAppServerClientLike,
  rootThreadId: string,
  input: {
    liveUsageByThreadId?: ReadonlyMap<string, RuntimeTokenUsageBreakdown>
    sessionRoots?: string[]
  } = {},
): Promise<CodexSessionTreeUsage> {
  const threads = await listDescendants(client, rootThreadId)
  const sessionRoots = input.sessionRoots ?? await discoverCodexSessionRoots()
  const summaries = await Promise.all(threads.map(thread => readThreadUsage(
    thread,
    sessionRoots,
    input.liveUsageByThreadId,
  )))
  return {
    subagentCount: threads.length,
    subagentTotal: summaries.reduce((total, usage) => addUsage(total, usage), zeroUsage()),
  }
}

async function listDescendants(client: CodexAppServerClientLike, rootThreadId: string): Promise<Thread[]> {
  const threads = new Map<string, Thread>()
  for (const archived of [false, true]) {
    let cursor: string | null = null
    const seenCursors = new Set<string>()
    do {
      const response = await client.request('thread/list', {
        ancestorThreadId: rootThreadId,
        sourceKinds: ['subAgent', 'subAgentReview', 'subAgentCompact', 'subAgentThreadSpawn', 'subAgentOther'],
        archived,
        cursor,
        limit: 100,
      }) as ThreadListResponse
      for (const thread of response.data ?? []) { threads.set(thread.id, thread) }
      const nextCursor = response.nextCursor
      if (!nextCursor || seenCursors.has(nextCursor)) { break }
      seenCursors.add(nextCursor)
      cursor = nextCursor
    } while (cursor)
  }
  return [...threads.values()]
}

async function readThreadUsage(
  thread: Thread,
  sessionRoots: string[],
  liveUsageByThreadId: ReadonlyMap<string, RuntimeTokenUsageBreakdown> | undefined,
): Promise<RuntimeTokenUsageBreakdown> {
  const liveUsage = liveUsageByThreadId?.get(thread.id)
  if (liveUsage) {
    return liveUsage
  }
  if (!thread.path) {
    return zeroUsage()
  }
  const archivePath = await resolveCodexArchivePath(thread.path, sessionRoots)
  return archivePath ? (await readCodexArchiveUsage(archivePath))?.usage ?? zeroUsage() : zeroUsage()
}

function addUsage(target: RuntimeTokenUsageBreakdown, usage: RuntimeTokenUsageBreakdown): RuntimeTokenUsageBreakdown {
  target.inputTokens += usage.inputTokens
  target.cachedInputTokens += usage.cachedInputTokens
  target.outputTokens += usage.outputTokens
  target.reasoningOutputTokens += usage.reasoningOutputTokens
  target.totalTokens += usage.totalTokens
  return target
}

function zeroUsage(): RuntimeTokenUsageBreakdown {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 }
}
