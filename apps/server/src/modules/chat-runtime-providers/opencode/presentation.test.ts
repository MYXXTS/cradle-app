import { describe, expect, it } from 'vitest'

import { OPENCODE_RUNTIME_CAPABILITIES } from './metadata'
import { createOpencodeRuntimePresentation } from './presentation'

describe('createOpencodeRuntimePresentation', () => {
  it('projects opencode commands and built-in UI slots', () => {
    const presentation = createOpencodeRuntimePresentation([
      {
        name: 'review',
        description: 'Review the current changes',
        template: 'Review this repository',
      },
    ])

    expect(presentation).toMatchObject({
      runtimeKind: 'opencode',
      slashCommands: [
        {
          name: 'review',
          description: 'Review the current changes',
          argumentHint: '',
        },
      ],
    })
    expect(presentation.uiSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'opencode:quick-question', name: 'btw', iconKey: 'quick-question' }),
        expect.objectContaining({ id: 'opencode:status', name: 'status', iconKey: 'status' }),
        expect.objectContaining({ id: 'opencode:model', name: 'model', iconKey: 'model' }),
        expect.objectContaining({ id: 'opencode:terminal', name: 'terminal', iconKey: 'terminal' }),
      ]),
    )
  })
})

describe('OPENCODE_RUNTIME_CAPABILITIES', () => {
  it('declares implemented runtime hooks', () => {
    expect(OPENCODE_RUNTIME_CAPABILITIES).toMatchObject({
      supportsShellExecution: true,
      supportsLastTurnRollback: true,
      supportsUiSlotStates: true,
      supportsSteerTurn: false,
      supportsRuntimeSettings: false,
    })
  })
})
