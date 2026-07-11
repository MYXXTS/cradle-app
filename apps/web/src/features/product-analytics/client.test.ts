import { describe, expect, it } from 'vitest'

import { bucketProductAnalyticsDuration, featureDomainForSurface } from './event-model'

describe('product analytics projections', () => {
  it('maps route surfaces to stable feature domains without exposing route ids', () => {
    expect(featureDomainForSurface('new-chat')).toBe('chat')
    expect(featureDomainForSurface('work')).toBe('work')
    expect(featureDomainForSurface('workspace-diffs')).toBe('diff')
    expect(featureDomainForSurface('plugin-center')).toBe('plugins')
    expect(featureDomainForSurface('settings')).toBeNull()
  })

  it('buckets run duration into bounded analytics properties', () => {
    expect(bucketProductAnalyticsDuration(9_999)).toBe('under_10s')
    expect(bucketProductAnalyticsDuration(10_000)).toBe('10s_30s')
    expect(bucketProductAnalyticsDuration(30_000)).toBe('30s_2m')
    expect(bucketProductAnalyticsDuration(120_000)).toBe('2m_10m')
    expect(bucketProductAnalyticsDuration(600_000)).toBe('over_10m')
  })
})
