import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LocalUsageSource } from './contract'
import {
  clearLocalUsageSnapshotCache,
  configureLocalUsageSources,
  getLocalUsageSnapshot,
} from './service'

afterEach(() => {
  configureLocalUsageSources([])
  clearLocalUsageSnapshotCache()
})

describe('local usage service', () => {
  it('aggregates provider summaries and isolates a failed provider', async () => {
    configureLocalUsageSources([
      source('codex', async () => ({
        providerKind: 'codex',
        status: 'available',
        sourceRootCount: 2,
        sessionCount: 4,
        lastActivityAt: 1_789_000_000_000,
        usage: {
          inputTokens: 100,
          cachedInputTokens: 75,
          outputTokens: 20,
          reasoningOutputTokens: 10,
          totalTokens: 120,
        },
      })),
      source('claude-agent', async () => {
        throw new Error('Transcript root is unreadable')
      }),
    ])

    await expect(getLocalUsageSnapshot()).resolves.toMatchObject({
      usage: {
        inputTokens: 100,
        cachedInputTokens: 75,
        outputTokens: 20,
        reasoningOutputTokens: 10,
        totalTokens: 120,
      },
      providers: [
        {
          providerKind: 'codex',
          status: 'available',
          sourceRootCount: 2,
          sessionCount: 4,
        },
        {
          providerKind: 'claude-agent',
          status: 'error',
          sourceRootCount: 0,
          sessionCount: 0,
          lastActivityAt: null,
          usage: zeroUsage(),
        },
      ],
    })
  })

  it('coalesces concurrent reads and reuses the snapshot cache', async () => {
    const readSummary = vi.fn(async () => ({
      providerKind: 'codex' as const,
      status: 'available' as const,
      sourceRootCount: 1,
      sessionCount: 1,
      lastActivityAt: 1_789_000_000_000,
      usage: { inputTokens: 10, cachedInputTokens: 8, outputTokens: 2, reasoningOutputTokens: 1, totalTokens: 12 },
    }))
    configureLocalUsageSources([source('codex', readSummary)])

    const [first, second] = await Promise.all([
      getLocalUsageSnapshot(),
      getLocalUsageSnapshot(),
    ])
    const cached = await getLocalUsageSnapshot()

    expect(readSummary).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    expect(cached).toBe(first)

    clearLocalUsageSnapshotCache()
    await getLocalUsageSnapshot()
    expect(readSummary).toHaveBeenCalledTimes(2)
  })

  it('invalidates the cache when the source registry changes', async () => {
    const codex = source('codex', async () => ({
      providerKind: 'codex',
      status: 'available',
      sourceRootCount: 1,
      sessionCount: 1,
      lastActivityAt: null,
      usage: { inputTokens: 5, cachedInputTokens: 0, outputTokens: 1, reasoningOutputTokens: 0, totalTokens: 6 },
    }))
    configureLocalUsageSources([codex])
    await getLocalUsageSnapshot()

    configureLocalUsageSources([])

    await expect(getLocalUsageSnapshot()).resolves.toMatchObject({
      usage: zeroUsage(),
      providers: [],
    })
  })
})

function source(
  providerKind: LocalUsageSource['providerKind'],
  readSummary: LocalUsageSource['readSummary'],
): LocalUsageSource {
  return { providerKind, readSummary }
}

function zeroUsage() {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 }
}
