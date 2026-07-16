import { describe, expect, it } from 'vitest'

import type { RuntimeHarnessFragment, RuntimeSession } from '../runtime-provider-types'
import {
  bindHarnessProjectionToProviderSession,
  invalidateHarnessProjection,
  markHarnessFragmentsProjected,
  resolvePendingHarnessFragments,
} from './provider-state'

const fragment: RuntimeHarnessFragment = {
  key: 'cradle-work',
  revision: 'cradle-work:work-1:primary:v1',
  content: '<cradle_work_state>work_id: work-1</cradle_work_state>',
}

function createRuntimeSession(providerSessionId: string | null = null): RuntimeSession {
  return {
    id: 'runtime-1',
    chatSessionId: 'session-1',
    providerTargetId: 'target-1',
    runtimeKind: 'codex',
    providerSessionId,
    providerStateSnapshot: JSON.stringify({ models: { currentModelId: null } }),
  }
}

describe('harness provider projection state', () => {
  it('projects a fragment once for a provider session and reprojects after invalidation', () => {
    const runtimeSession = createRuntimeSession()

    expect(resolvePendingHarnessFragments(runtimeSession, [fragment])).toEqual([fragment])
    markHarnessFragmentsProjected(runtimeSession, [fragment])
    expect(resolvePendingHarnessFragments(runtimeSession, [fragment])).toEqual([])

    bindHarnessProjectionToProviderSession(runtimeSession, 'provider-thread-1')
    runtimeSession.providerSessionId = 'provider-thread-1'
    expect(resolvePendingHarnessFragments(runtimeSession, [fragment])).toEqual([])

    invalidateHarnessProjection(runtimeSession)
    expect(resolvePendingHarnessFragments(runtimeSession, [fragment])).toEqual([fragment])
  })

  it('reprojects fragments when the provider thread changes', () => {
    const runtimeSession = createRuntimeSession('provider-thread-1')
    markHarnessFragmentsProjected(runtimeSession, [fragment])

    runtimeSession.providerSessionId = 'provider-thread-2'
    expect(resolvePendingHarnessFragments(runtimeSession, [fragment])).toEqual([fragment])
  })
})
