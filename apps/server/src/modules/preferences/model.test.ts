import { describe, expect, it } from 'vitest'

import { AppPreferencesJsonSchema, KeybindingsPreferencesJsonSchema } from './model'

describe('appPreferencesJsonSchema', () => {
  it('keeps experimental turn checkpoints disabled by default', () => {
    expect(AppPreferencesJsonSchema.parse(undefined).featureFlags.turnCheckpoints).toBe(false)
  })
})

describe('keybindingsPreferencesJsonSchema', () => {
  it('parses the JSON text stored in the keybindings file', () => {
    expect(
      KeybindingsPreferencesJsonSchema.parse(
        '[{"command":"layout.toggle-aside","key":"cmd+alt+b"}]',
      ),
    ).toEqual([{ command: 'layout.toggle-aside', key: 'cmd+alt+b' }])
  })
})
