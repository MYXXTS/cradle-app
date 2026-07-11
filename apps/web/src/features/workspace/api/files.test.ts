import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listWorkspaceFileChildren } from './files'

const mocks = vi.hoisted(() => ({
  listChildren: vi.fn(),
}))

vi.mock('~/api-gen/sdk.gen', () => ({
  getWorkspacesByWorkspaceIdFilesChildren: mocks.listChildren,
}))

describe('workspace files gateway', () => {
  beforeEach(() => {
    mocks.listChildren.mockReset()
  })

  it('uses the generated authenticated client and omits an empty path query', async () => {
    mocks.listChildren.mockResolvedValue({
      data: [{ type: 'file', name: 'README.md', path: 'README.md' }],
    })

    await expect(listWorkspaceFileChildren('workspace-1', '')).resolves.toEqual([
      { type: 'file', name: 'README.md', path: 'README.md' },
    ])
    expect(mocks.listChildren).toHaveBeenCalledWith({
      path: { workspaceId: 'workspace-1' },
      query: undefined,
      throwOnError: true,
    })
  })

  it('passes nested paths and rejects transport or response errors', async () => {
    mocks.listChildren.mockResolvedValueOnce({ data: [] })
    await listWorkspaceFileChildren('workspace-1', 'src')
    expect(mocks.listChildren).toHaveBeenLastCalledWith({
      path: { workspaceId: 'workspace-1' },
      query: { path: 'src' },
      throwOnError: true,
    })

    const transportError = new Error('HTTP 401')
    mocks.listChildren.mockRejectedValueOnce(transportError)
    await expect(listWorkspaceFileChildren('workspace-1', 'src')).rejects.toBe(transportError)

    mocks.listChildren.mockResolvedValueOnce({ data: [{ type: 'unknown' }] })
    await expect(listWorkspaceFileChildren('workspace-1', 'src')).rejects.toMatchObject({ name: 'ZodError' })
  })
})
