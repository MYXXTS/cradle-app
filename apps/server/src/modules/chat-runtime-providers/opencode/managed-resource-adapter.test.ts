import { describe, expect, it, vi } from 'vitest'

import { createOpencodeManagedResourceAdapter } from './managed-resource-adapter'
import type { OpencodeRuntimeStatus } from './runtime-installation'

const KEY = { namespace: 'opencode', resourceType: 'runtime', resourceId: 'cli' } as const

function status(overrides: Partial<OpencodeRuntimeStatus> = {}): OpencodeRuntimeStatus {
  return {
    state: 'missing',
    source: null,
    version: null,
    targetVersion: '1.17.11',
    managedInstalled: false,
    installedSizeBytes: null,
    downloadSizeBytes: 42,
    errorCode: 'opencode_runtime_not_installed',
    ...overrides,
  }
}

function installation(projected: OpencodeRuntimeStatus) {
  return {
    status: vi.fn(async () => projected),
    install: vi.fn(async () => projected),
    uninstall: vi.fn(async () => projected),
  }
}

describe('openCode managed resource adapter', () => {
  it.each([
    ['missing', status(), 'not-installed', null, true, false, false],
    ['PATH external', status({ state: 'ready', source: 'path', version: '1.16.0' }), 'installed', 'external', true, false, false],
    ['configured external', status({ state: 'ready', source: 'configured', version: '1.16.0' }), 'installed', 'external', false, false, false],
    ['managed', status({ state: 'ready', source: 'managed', version: '1.17.11', managedInstalled: true }), 'installed', 'managed', false, false, true],
    ['managed update', status({ state: 'update-available', source: 'managed', version: '1.16.0', managedInstalled: true }), 'update-available', 'managed', false, true, true],
    ['installing', status({ state: 'installing' }), 'installing', null, false, false, false],
    ['error', status({ state: 'error', errorCode: 'opencode_runtime_probe_failed' }), 'error', null, true, false, false],
    ['unsupported', status({ state: 'unavailable', errorCode: 'opencode_runtime_target_unsupported' }), 'unavailable', null, false, false, false],
  ] as const)(
    'projects %s owner truth',
    async (_label, ownerStatus, expectedState, source, install, update, uninstall) => {
      const adapter = createOpencodeManagedResourceAdapter(installation(ownerStatus))
      const projection = await adapter.project(KEY)
      expect(projection).toMatchObject({
        state: expectedState,
        installationSource: source,
        actions: {
          install: { available: install },
          update: { available: update },
          uninstall: { available: uninstall },
        },
      })
    },
  )

  it('declares before download and dispatches only owner lifecycle methods', async () => {
    const owner = installation(status({ state: 'ready', source: 'managed', version: '1.17.11', managedInstalled: true }))
    const adapter = createOpencodeManagedResourceAdapter(owner)
    expect(adapter.declarations()).toEqual([expect.objectContaining({ key: KEY, required: false, kind: 'runtime' })])

    await adapter.execute(KEY, 'install')
    await adapter.execute(KEY, 'update')
    await adapter.execute(KEY, 'uninstall')
    expect(owner.install).toHaveBeenCalledTimes(2)
    expect(owner.uninstall).toHaveBeenCalledOnce()
  })
})
