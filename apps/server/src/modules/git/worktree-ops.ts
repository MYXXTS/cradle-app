import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import simpleGit from 'simple-git'

import { AppError } from '../../errors/app-error'
import { runGitCommand } from './git-command'

export interface GitWorktreeEntryView {
  path: string
  head: string
  branch: string | null
  detached: boolean
}

export async function getHeadSha(repoPath: string): Promise<string> {
  return (await runGitCommand(repoPath, ['rev-parse', 'HEAD'])).trim()
}

export async function isWorkingTreeDirty(repoPath: string): Promise<boolean> {
  const status = await simpleGit(repoPath).status()
  return status.files.length > 0
}

export async function listGitWorktrees(repoPath: string): Promise<GitWorktreeEntryView[]> {
  const output = await runGitCommand(repoPath, ['worktree', 'list', '--porcelain'])
  const entries: GitWorktreeEntryView[] = []
  let current: Partial<GitWorktreeEntryView> | null = null

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current?.path) {
        entries.push(current as GitWorktreeEntryView)
      }
      current = { path: line.slice('worktree '.length).trim(), head: '', branch: null, detached: false }
      continue
    }
    if (!current) {
      continue
    }
    if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length).trim()
    }
    if (line.startsWith('branch ')) {
      current.branch = line.slice('branch refs/heads/'.length).trim()
    }
    if (line === 'detached') {
      current.detached = true
    }
  }
  if (current?.path) {
    entries.push(current as GitWorktreeEntryView)
  }
  return entries
}

export async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await runGitCommand(repoPath, ['show-ref', '--verify', `refs/heads/${branch}`])
    return true
  }
  catch {
    return false
  }
}

export async function addGitWorktree(input: {
  repoPath: string
  worktreePath: string
  branch: string
  baseRef?: string
}): Promise<void> {
  mkdirSync(dirname(input.worktreePath), { recursive: true })
  const baseRef = input.baseRef ?? (await getHeadSha(input.repoPath))
  const args = ['worktree', 'add', '-b', input.branch, input.worktreePath, baseRef]
  try {
    await runGitCommand(input.repoPath, args)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new AppError({
      code: 'git_worktree_add_failed',
      status: 409,
      message: 'Failed to create git worktree',
      details: { repoPath: input.repoPath, worktreePath: input.worktreePath, reason: message },
    })
  }
}

export async function addGitWorktreeExistingBranch(input: {
  repoPath: string
  worktreePath: string
  branch: string
}): Promise<void> {
  mkdirSync(dirname(input.worktreePath), { recursive: true })
  const args = ['worktree', 'add', input.worktreePath, input.branch]
  try {
    await runGitCommand(input.repoPath, args)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new AppError({
      code: 'git_worktree_add_failed',
      status: 409,
      message: 'Failed to attach git worktree to existing branch',
      details: { repoPath: input.repoPath, worktreePath: input.worktreePath, branch: input.branch, reason: message },
    })
  }
}

export async function removeGitWorktree(input: {
  repoPath: string
  worktreePath: string
  force?: boolean
}): Promise<void> {
  const args = ['worktree', 'remove', ...(input.force ? ['--force'] : []), input.worktreePath]
  await runGitCommand(input.repoPath, args)
}

export async function pruneGitWorktrees(repoPath: string): Promise<void> {
  await runGitCommand(repoPath, ['worktree', 'prune'])
}

export async function deleteLocalBranch(repoPath: string, branch: string): Promise<void> {
  await runGitCommand(repoPath, ['branch', '-D', branch])
}

export async function mergeBranch(repoPath: string, branch: string): Promise<void> {
  await runGitCommand(repoPath, ['merge', branch])
}

export async function stashAndPopAcrossCheckouts(input: {
  mainRepoPath: string
  worktreePath: string
  message: string
}): Promise<{ conflict: boolean }> {
  await runGitCommand(input.mainRepoPath, ['stash', 'push', '-u', '-m', input.message])
  try {
    await runGitCommand(input.worktreePath, ['stash', 'pop'])
    return { conflict: false }
  }
  catch {
    return { conflict: true }
  }
}

export function resolveWorktreeAbsolutePath(repoRoot: string, relativePath: string): string {
  return join(repoRoot, relativePath)
}

export async function resolveGitRepoRoot(workspacePath: string): Promise<string> {
  const root = (await runGitCommand(workspacePath, ['rev-parse', '--show-toplevel'])).trim()
  if (!root) {
    throw new AppError({
      code: 'git_repository_unavailable',
      status: 409,
      message: 'Git repository root could not be resolved',
      details: { workspacePath },
    })
  }
  return root
}
