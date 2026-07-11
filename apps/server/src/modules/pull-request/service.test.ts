import { describe, expect, it } from 'vitest'

import { isForceWithLeaseRejection, resolveDeliveryPushArgs } from './delivery-push'
import { parseGitHubOwnerRepo } from './github-remote'

describe('parseGitHubOwnerRepo', () => {
  it('parses HTTPS GitHub URLs', () => {
    expect(parseGitHubOwnerRepo('https://github.com/acme/widgets.git')).toEqual({
      owner: 'acme',
      repo: 'widgets',
    })
  })

  it('parses SSH GitHub URLs', () => {
    expect(parseGitHubOwnerRepo('git@github.com:acme/widgets.git')).toEqual({
      owner: 'acme',
      repo: 'widgets',
    })
  })

  it('rejects non-GitHub remotes', () => {
    expect(parseGitHubOwnerRepo('https://gitlab.com/acme/widgets.git')).toBeNull()
  })
})

describe('resolveDeliveryPushArgs', () => {
  it('uses an ordinary upstream push when the remote branch is absent', () => {
    expect(resolveDeliveryPushArgs({
      branch: 'cradle/wt/example',
      remoteSha: null,
    })).toEqual(['--set-upstream'])
  })

  it('uses force-with-lease against the observed remote tip for republish', () => {
    expect(resolveDeliveryPushArgs({
      branch: 'cradle/wt/example',
      remoteSha: 'abc1234def',
    })).toEqual([
      '--set-upstream',
      '--force-with-lease=cradle/wt/example:abc1234def',
    ])
  })
})

describe('isForceWithLeaseRejection', () => {
  it('recognizes non-fast-forward and lease rejection messages', () => {
    expect(isForceWithLeaseRejection('! [rejected] non-fast-forward')).toBe(true)
    expect(isForceWithLeaseRejection('stale info')).toBe(true)
    expect(isForceWithLeaseRejection('rejected\nhint: fetch first')).toBe(true)
    expect(isForceWithLeaseRejection('error: failed to push some refs')).toBe(false)
    expect(isForceWithLeaseRejection('authentication failed')).toBe(false)
  })
})
