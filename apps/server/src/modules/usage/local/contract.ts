import type { RuntimeTokenUsageBreakdown } from '@cradle/chat-runtime-contracts'

export type LocalUsageProviderKind = 'codex' | 'claude-agent'
export type LocalUsageProviderStatus = 'available' | 'unavailable' | 'error'

export interface LocalUsageProviderSummary {
  providerKind: LocalUsageProviderKind
  status: LocalUsageProviderStatus
  sourceRootCount: number
  sessionCount: number
  lastActivityAt: number | null
  usage: RuntimeTokenUsageBreakdown
}

export interface LocalUsageSnapshot {
  generatedAt: number
  usage: RuntimeTokenUsageBreakdown
  providers: LocalUsageProviderSummary[]
}

export interface LocalUsageSource {
  readonly providerKind: LocalUsageProviderKind
  readSummary: () => Promise<LocalUsageProviderSummary>
}

export function emptyTokenUsage(): RuntimeTokenUsageBreakdown {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 }
}

export function addTokenUsage(
  target: RuntimeTokenUsageBreakdown,
  source: RuntimeTokenUsageBreakdown,
): RuntimeTokenUsageBreakdown {
  target.inputTokens += source.inputTokens
  target.cachedInputTokens += source.cachedInputTokens
  target.outputTokens += source.outputTokens
  target.reasoningOutputTokens += source.reasoningOutputTokens
  target.totalTokens += source.totalTokens
  return target
}
