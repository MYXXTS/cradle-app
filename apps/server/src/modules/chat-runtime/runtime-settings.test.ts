import { describe, expect, it } from 'vitest'

import { getDefaultRuntimeSettings, resolveRunRuntimeSettings } from './runtime-settings'

describe('resolveRunRuntimeSettings', () => {
  const runtimeKind = 'codex'

  it('returns session settings when the request omits runtime settings', () => {
    expect(resolveRunRuntimeSettings(runtimeKind, {
      accessMode: 'approval-required',
      interactionMode: 'plan',
    })).toEqual({
      accessMode: 'approval-required',
      interactionMode: 'plan',
    })
  })

  it('keeps session plan mode when the client sends the full stale default bundle', () => {
    expect(resolveRunRuntimeSettings(
      runtimeKind,
      { accessMode: 'full-access', interactionMode: 'plan' },
      getDefaultRuntimeSettings(runtimeKind),
    )).toEqual({
      accessMode: 'full-access',
      interactionMode: 'plan',
    })
  })

  it('keeps session approval-required when the client sends only stale full-access defaults', () => {
    expect(resolveRunRuntimeSettings(
      runtimeKind,
      { accessMode: 'approval-required', interactionMode: 'default' },
      getDefaultRuntimeSettings(runtimeKind),
    )).toEqual({
      accessMode: 'approval-required',
      interactionMode: 'default',
    })
  })

  it('applies explicit request overrides that differ from defaults', () => {
    expect(resolveRunRuntimeSettings(
      runtimeKind,
      { accessMode: 'full-access', interactionMode: 'plan' },
      { accessMode: 'approval-required', interactionMode: 'default' },
    )).toEqual({
      accessMode: 'approval-required',
      interactionMode: 'default',
    })
  })
})
