import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearLocalUsageFileSummaryCache, readCachedFileSummaries } from './file-summary-cache'

const tempDirs: string[] = []

afterEach(() => {
  clearLocalUsageFileSummaryCache()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('local usage file summary cache', () => {
  it('reuses unchanged summaries and invalidates changed files', async () => {
    const path = writeTempFile('usage')
    const reader = vi.fn(async file => ({ content: await readFile(file, 'utf8') }))

    await readCachedFileSummaries('provider', [path], reader)
    await readCachedFileSummaries('provider', [path], reader)
    expect(reader).toHaveBeenCalledTimes(1)

    appendFileSync(path, '-updated')
    await expect(readCachedFileSummaries('provider', [path], reader)).resolves.toEqual([
      { content: 'usage-updated' },
    ])
    expect(reader).toHaveBeenCalledTimes(2)
  })

  it('prunes summaries for files that leave discovery', async () => {
    const first = writeTempFile('first')
    const second = writeTempFile('second')
    const reader = vi.fn(async file => ({ content: await readFile(file, 'utf8') }))

    await readCachedFileSummaries('provider', [first, second], reader)
    await readCachedFileSummaries('provider', [first], reader)
    await readCachedFileSummaries('provider', [second], reader)

    expect(reader).toHaveBeenCalledTimes(3)
  })

  it('bounds concurrent file reads', async () => {
    const paths = Array.from({ length: 24 }, (_, index) => writeTempFile(String(index)))
    let active = 0
    let maximumActive = 0
    const reader = vi.fn(async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise<void>(resolve => setImmediate(resolve))
      active -= 1
      return { parsed: true }
    })

    await readCachedFileSummaries('provider', paths, reader)

    expect(maximumActive).toBeGreaterThan(1)
    expect(maximumActive).toBeLessThanOrEqual(16)
  })
})

function writeTempFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cradle-usage-cache-'))
  tempDirs.push(dir)
  const path = join(dir, 'usage.jsonl')
  writeFileSync(path, content)
  return path
}
