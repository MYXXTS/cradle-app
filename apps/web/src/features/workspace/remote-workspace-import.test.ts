import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchRemoteUpstreamJson } from '~/features/remote-hosts/upstream-fetch'

import { ensureRemoteWorkspaceForPath } from './remote-workspace-import'

vi.mock('~/features/remote-hosts/upstream-fetch', () => ({
  fetchRemoteUpstreamJson: vi.fn(),
}))

const remoteWorkspace = {
  id: 'remote-ws-1',
  name: 'cradle-app',
  locator: {
    hostId: 'local',
    path: '/Users/me/dev/cradle-app',
  },
  gitIdentity: {
    branch: 'main',
    originUrl: null,
    repoRoot: '/Users/me/dev/cradle-app',
    headSha: null,
  },
}

describe('ensureRemoteWorkspaceForPath', () => {
  beforeEach(() => {
    vi.mocked(fetchRemoteUpstreamJson).mockReset()
  })

  it('reuses an existing remote workspace without creating', async () => {
    vi.mocked(fetchRemoteUpstreamJson).mockResolvedValueOnce(remoteWorkspace)

    const input = await ensureRemoteWorkspaceForPath('host-1', '/Users/me/dev/cradle-app')

    expect(input).toEqual({
      name: 'cradle-app',
      locator: {
        hostId: 'host-1',
        path: '/Users/me/dev/cradle-app',
        kind: undefined,
        sourceWorkspaceId: 'remote-ws-1',
      },
      gitIdentity: remoteWorkspace.gitIdentity,
    })
    expect(fetchRemoteUpstreamJson).toHaveBeenCalledTimes(1)
    expect(fetchRemoteUpstreamJson).toHaveBeenCalledWith(
      'host-1',
      expect.stringContaining('/workspaces/resolve?'),
    )
  })

  it('creates on the remote host when resolve misses', async () => {
    vi.mocked(fetchRemoteUpstreamJson)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(remoteWorkspace)

    const input = await ensureRemoteWorkspaceForPath('host-1', '/Users/me/dev/cradle-app')

    expect(input.locator.sourceWorkspaceId).toBe('remote-ws-1')
    expect(fetchRemoteUpstreamJson).toHaveBeenNthCalledWith(
      2,
      'host-1',
      '/workspaces/from-directory',
      { method: 'POST', body: { path: '/Users/me/dev/cradle-app' } },
    )
  })

  it('resolves again when create returns locator-exists', async () => {
    vi.mocked(fetchRemoteUpstreamJson)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce({ code: 'workspace_locator_exists' })
      .mockResolvedValueOnce(remoteWorkspace)

    const input = await ensureRemoteWorkspaceForPath('host-1', '/Users/me/dev/cradle-app')

    expect(input.locator.sourceWorkspaceId).toBe('remote-ws-1')
    expect(fetchRemoteUpstreamJson).toHaveBeenCalledTimes(3)
  })
})
