/**
 * Delivery push args for Cradle-managed worktree branches.
 * - First publish: ordinary upstream push.
 * - Remote tip already exists: `--force-with-lease` against the observed tip so
 *   local amend/rebase can republish, while a concurrent remote update still fails.
 */
export function resolveDeliveryPushArgs(input: {
  branch: string
  remoteSha: string | null
}): string[] {
  if (!input.remoteSha) {
    return ['--set-upstream']
  }
  return [
    '--set-upstream',
    `--force-with-lease=${input.branch}:${input.remoteSha}`,
  ]
}

export function isForceWithLeaseRejection(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('stale info')
    || normalized.includes('non-fast-forward')
    || (normalized.includes('rejected') && normalized.includes('fetch first'))
}
