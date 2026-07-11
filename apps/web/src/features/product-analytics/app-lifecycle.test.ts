import { beforeEach, describe, expect, it } from 'vitest'

import { readAppOpenAnalyticsProperties } from './app-lifecycle'

describe('product analytics app lifecycle', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('distinguishes first seen, returning, and updated app opens', () => {
    expect(readAppOpenAnalyticsProperties('1.0.0')).toEqual({
      lifecycle_stage: 'first_seen',
      previous_version: null,
    })
    expect(readAppOpenAnalyticsProperties('1.0.0')).toEqual({
      lifecycle_stage: 'returning',
      previous_version: '1.0.0',
    })
    expect(readAppOpenAnalyticsProperties('1.1.0')).toEqual({
      lifecycle_stage: 'updated',
      previous_version: '1.0.0',
    })
  })

  it('recovers from invalid local lifecycle state', () => {
    localStorage.setItem('cradle:product-analytics:lifecycle:v1', '{invalid')

    expect(readAppOpenAnalyticsProperties('1.0.0')).toEqual({
      lifecycle_stage: 'first_seen',
      previous_version: null,
    })
  })
})
