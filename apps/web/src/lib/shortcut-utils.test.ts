import { describe, expect, it } from 'vitest'

import { matchesShortcut } from './shortcut-utils'

describe('matchesShortcut', () => {
  it('matches an Option-modified letter by its physical key code', () => {
    const event = {
      key: '∫',
      code: 'KeyB',
      metaKey: true,
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
    } as KeyboardEvent

    expect(matchesShortcut(event, { meta: true, alt: true, key: 'b' })).toBe(true)
  })

  it('does not match a different physical letter key', () => {
    const event = {
      key: '∫',
      code: 'KeyC',
      metaKey: true,
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
    } as KeyboardEvent

    expect(matchesShortcut(event, { meta: true, alt: true, key: 'b' })).toBe(false)
  })
})
