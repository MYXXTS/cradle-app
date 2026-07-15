import { readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import type { RuntimeTokenUsageBreakdown } from '@cradle/chat-runtime-contracts'

import type { LocalUsageSource } from '../../usage/local/contract'
import { readCachedFileSummaries } from '../../usage/local/file-summary-cache'
import { resolveClaudeAgentSdkConfigDir } from './runtime-context'
import { readClaudeArchiveUsage } from './usage-archive'

export const claudeAgentLocalUsageSource: LocalUsageSource = {
  providerKind: 'claude-agent',
  async readSummary() {
    const roots = await distinctRoots([
      join(homedir(), '.claude', 'projects'),
      join(resolveClaudeAgentSdkConfigDir(), 'projects'),
      process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, 'projects') : null,
    ])
    if (roots.length === 0) { return emptySummary() }
    const files = (await Promise.all(roots.map(listTranscripts))).flat()
    const summaries = (await readCachedFileSummaries('claude-agent', files, readClaudeArchiveUsage))
      .filter(summary => summary !== null)
    return {
      providerKind: 'claude-agent' as const,
      status: 'available' as const,
      sourceRootCount: roots.length,
      sessionCount: summaries.length,
      lastActivityAt: summaries.reduce<number | null>((latest, item) => latest === null ? item.occurredAt : Math.max(latest, item.occurredAt), null),
      usage: sumUsage(summaries),
    }
  },
}

async function distinctRoots(candidates: Array<string | null>): Promise<string[]> {
  const roots = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate) { continue }
    try {
      if ((await stat(candidate)).isDirectory()) { roots.add(await realpath(candidate)) }
    }
    catch {}
  }
  return [...roots]
}

async function listTranscripts(root: string): Promise<string[]> {
  const files: string[] = []
  for (const project of await readdir(root, { withFileTypes: true })) {
    if (!project.isDirectory()) { continue }
    const projectRoot = resolve(root, project.name)
    for (const entry of await readdir(projectRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) { files.push(resolve(projectRoot, entry.name)) }
    }
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

function emptySummary() {
  return { providerKind: 'claude-agent' as const, status: 'unavailable' as const, sourceRootCount: 0, sessionCount: 0, lastActivityAt: null, usage: zeroUsage() }
}

function zeroUsage(): RuntimeTokenUsageBreakdown {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 }
}
