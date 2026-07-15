import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { RuntimeTokenUsageBreakdown } from '@cradle/chat-runtime-contracts'

import type { LocalUsageSource } from '../../usage/local/contract'
import { readCachedFileSummaries } from '../../usage/local/file-summary-cache'
import { readCodexArchiveUsage } from './usage-archive'
import { discoverCodexSessionRoots } from './usage-roots'

export const codexLocalUsageSource: LocalUsageSource = {
  providerKind: 'codex',
  async readSummary() {
    const roots = await discoverCodexSessionRoots()
    if (roots.length === 0) {
      return emptySummary()
    }
    const files = (await Promise.all(roots.map(listJsonl))).flat()
    const summaries = (await readCachedFileSummaries('codex', files, readCodexArchiveUsage))
      .filter(summary => summary !== null)
    return {
      providerKind: 'codex' as const,
      status: 'available' as const,
      sourceRootCount: roots.length,
      sessionCount: summaries.length,
      lastActivityAt: latestActivity(summaries),
      usage: sumUsage(summaries),
    }
  },
}

async function listJsonl(root: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) { files.push(...await listJsonl(path)) }
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) { files.push(path) }
  }
  return files
}

function sumUsage(summaries: Array<{ usage: RuntimeTokenUsageBreakdown }>): RuntimeTokenUsageBreakdown {
  return summaries.reduce((total, { usage }) => ({
    inputTokens: total.inputTokens + usage.inputTokens,
    cachedInputTokens: total.cachedInputTokens + usage.cachedInputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    reasoningOutputTokens: total.reasoningOutputTokens + usage.reasoningOutputTokens,
    totalTokens: total.totalTokens + usage.totalTokens,
  }), zeroUsage())
}

function latestActivity(summaries: Array<{ occurredAt: number }>): number | null {
  return summaries.reduce<number | null>((latest, item) => latest === null ? item.occurredAt : Math.max(latest, item.occurredAt), null)
}

function emptySummary() {
  return { providerKind: 'codex' as const, status: 'unavailable' as const, sourceRootCount: 0, sessionCount: 0, lastActivityAt: null, usage: zeroUsage() }
}

function zeroUsage(): RuntimeTokenUsageBreakdown {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 }
}
