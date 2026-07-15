import { realpath, stat } from 'node:fs/promises'

const FILE_READ_CONCURRENCY = 16

interface CachedFileSummary {
  size: number
  modifiedAt: number
  value: object | null
}

const caches = new Map<string, Map<string, CachedFileSummary>>()

export async function readCachedFileSummaries<T extends object>(
  namespace: string,
  paths: string[],
  reader: (path: string) => Promise<T | null>,
): Promise<Array<T | null>> {
  const cache = caches.get(namespace) ?? new Map<string, CachedFileSummary>()
  caches.set(namespace, cache)
  const canonicalPaths = await Promise.all(paths.map(async path => await realpath(path).catch(() => path)))
  const currentPaths = new Set(canonicalPaths)
  for (const path of cache.keys()) {
    if (!currentPaths.has(path)) {
      cache.delete(path)
    }
  }

  const results: Array<T | null> = Array.from({ length: canonicalPaths.length }).fill(null)
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(FILE_READ_CONCURRENCY, canonicalPaths.length) },
    async () => {
      while (nextIndex < canonicalPaths.length) {
        const index = nextIndex
        nextIndex += 1
        const path = canonicalPaths[index]!
        const metadata = await stat(path)
        const cached = cache.get(path)
        if (cached && cached.size === metadata.size && cached.modifiedAt === metadata.mtimeMs) {
          results[index] = cached.value as T | null
          continue
        }
        const value = await reader(path)
        cache.set(path, { size: metadata.size, modifiedAt: metadata.mtimeMs, value })
        results[index] = value
      }
    },
  )
  await Promise.all(workers)
  return results
}

export function clearLocalUsageFileSummaryCache(namespace?: string): void {
  if (namespace) {
    caches.delete(namespace)
    return
  }
  caches.clear()
}
