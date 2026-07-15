import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { discoverCodexSessionRoots, resolveCodexArchivePath } from './usage-roots'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('codex usage roots', () => {
  it('discovers and canonicalizes distinct session roots', async () => {
    const homeDir = tempDir()
    const dataDir = tempDir()
    const externalHome = join(tempDir(), 'codex-link')
    const userRoot = join(homeDir, '.codex', 'sessions')
    const cradleRoot = join(dataDir, 'runtimes', 'codex-app-server', 'sessions')
    mkdirSync(userRoot, { recursive: true })
    mkdirSync(cradleRoot, { recursive: true })
    symlinkSync(join(homeDir, '.codex'), externalHome, 'dir')

    await expect(discoverCodexSessionRoots({
      homeDir,
      env: { CRADLE_DATA_DIR: dataDir, CODEX_HOME: externalHome },
    })).resolves.toEqual(expect.arrayContaining([realpathSync(userRoot), realpathSync(cradleRoot)]))
    expect(await discoverCodexSessionRoots({
      homeDir,
      env: { CRADLE_DATA_DIR: dataDir, CODEX_HOME: externalHome },
    })).toHaveLength(2)
  })

  it('accepts only canonical archive paths contained by a session root', async () => {
    const root = tempDir()
    const outside = tempDir()
    const archive = join(root, 'session.jsonl')
    const outsideArchive = join(outside, 'session.jsonl')
    writeFileSync(archive, '')
    writeFileSync(outsideArchive, '')

    await expect(resolveCodexArchivePath(archive, [root])).resolves.toBe(realpathSync(archive))
    await expect(resolveCodexArchivePath(outsideArchive, [root])).resolves.toBeNull()
  })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cradle-codex-roots-'))
  tempDirs.push(dir)
  return dir
}
