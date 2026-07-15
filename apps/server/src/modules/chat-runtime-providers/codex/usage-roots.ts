import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'

import { resolveCodexAppServerHome } from './app-server/runtime-home'

export async function discoverCodexSessionRoots(input: {
  env?: NodeJS.ProcessEnv
  homeDir?: string
} = {}): Promise<string[]> {
  const env = input.env ?? process.env
  const homeDir = input.homeDir ?? homedir()
  const candidates = [
    join(homeDir, '.codex', 'sessions'),
    join(resolveCodexAppServerHome({ env, homeDir }), 'sessions'),
    env.CODEX_HOME ? join(env.CODEX_HOME, 'sessions') : null,
  ]
  const roots = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    try {
      if ((await stat(candidate)).isDirectory()) {
        roots.add(await realpath(candidate))
      }
    }
    catch {}
  }
  return [...roots]
}

export async function resolveCodexArchivePath(
  path: string,
  sessionRoots: string[],
): Promise<string | null> {
  try {
    const canonicalPath = await realpath(path)
    const canonicalRoots = await Promise.all(sessionRoots.map(async root => await realpath(root)))
    const contained = canonicalRoots.some((root) => {
      const child = relative(root, canonicalPath)
      return child.length > 0 && !child.startsWith('..') && !isAbsolute(child)
    })
    return contained ? canonicalPath : null
  }
  catch {
    return null
  }
}
