import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

interface WorktreesJson {
  setup?: Record<string, string[]>
}

/** Runs optional `.cradle/worktrees.json` hooks after checkout creation (Cursor-style). */
export async function runWorktreeSetupHooks(
  workspacePath: string,
  checkoutPath: string,
): Promise<string[]> {
  const configPath = join(workspacePath, '.cradle', 'worktrees.json')
  if (!existsSync(configPath)) {
    return []
  }

  let config: WorktreesJson
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8')) as WorktreesJson
  }
  catch {
    return ['Failed to parse .cradle/worktrees.json']
  }

  const platformKey = process.platform
  const commands = config.setup?.[platformKey] ?? config.setup?.default ?? []
  const warnings: string[] = []

  for (const command of commands) {
    try {
      await execFileAsync('sh', ['-lc', command], { cwd: checkoutPath })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`Setup command failed (${command}): ${message}`)
    }
  }

  return warnings
}
