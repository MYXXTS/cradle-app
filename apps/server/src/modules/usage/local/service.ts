import type { LocalUsageProviderSummary, LocalUsageSnapshot, LocalUsageSource } from './contract'
import { addTokenUsage, emptyTokenUsage } from './contract'

const SNAPSHOT_TTL_MS = 30_000
let sources: LocalUsageSource[] = []
let cachedSnapshot: { expiresAt: number, value: LocalUsageSnapshot } | null = null
let pendingSnapshot: Promise<LocalUsageSnapshot> | null = null

export function configureLocalUsageSources(nextSources: LocalUsageSource[]): void {
  sources = [...nextSources]
  clearLocalUsageSnapshotCache()
}

export async function getLocalUsageSnapshot(): Promise<LocalUsageSnapshot> {
  const now = Date.now()
  if (cachedSnapshot && cachedSnapshot.expiresAt > now) {
    return cachedSnapshot.value
  }
  if (pendingSnapshot) {
    return pendingSnapshot
  }
  pendingSnapshot = collectSnapshot().then((value) => {
    cachedSnapshot = { expiresAt: Date.now() + SNAPSHOT_TTL_MS, value }
    return value
  }).finally(() => {
    pendingSnapshot = null
  })
  return pendingSnapshot
}

export function clearLocalUsageSnapshotCache(): void {
  cachedSnapshot = null
  pendingSnapshot = null
}

async function collectSnapshot(): Promise<LocalUsageSnapshot> {
  const settled = await Promise.allSettled(sources.map(source => source.readSummary()))
  const providers = settled.map<LocalUsageProviderSummary>((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value
    }
    return {
      providerKind: sources[index]!.providerKind,
      status: 'error',
      sourceRootCount: 0,
      sessionCount: 0,
      lastActivityAt: null,
      usage: emptyTokenUsage(),
    }
  })
  return {
    generatedAt: Date.now(),
    usage: providers.reduce((total, provider) => addTokenUsage(total, provider.usage), emptyTokenUsage()),
    providers,
  }
}
