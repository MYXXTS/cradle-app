import { describe, expect, it } from 'vitest'

import { resolvePrimaryWorkRedirect } from './$sessionId'

describe('resolvePrimaryWorkRedirect', () => {
  it('redirects a primary Work Session to its Work surface', () => {
    expect(resolvePrimaryWorkRedirect('session-1', {
      work: { id: 'work-1', primarySessionId: 'session-1' },
    })).toBe('work-1')
  })

  it('keeps ordinary and non-primary Sessions on Chat', () => {
    expect(resolvePrimaryWorkRedirect('session-1', { work: null })).toBeNull()
    expect(resolvePrimaryWorkRedirect('session-1', {
      work: { id: 'work-1', primarySessionId: 'session-2' },
    })).toBeNull()
  })
})
