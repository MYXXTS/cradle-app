import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getServerConfig } from '../../infra'

export function resolveCradleDataDir(): string {
  const config = getServerConfig()
  return config.dataDir ?? dirname(config.dbPath)
}

/** Cradle-owned checkout path under Application Support. */
export function resolveWorktreeCheckoutPath(sourceWorkspaceId: string, name: string): string {
  return join(resolveCradleDataDir(), 'worktrees', sourceWorkspaceId, name)
}

export function ensureWorktreeCheckoutParentDir(absolutePath: string): void {
  mkdirSync(dirname(absolutePath), { recursive: true })
}
