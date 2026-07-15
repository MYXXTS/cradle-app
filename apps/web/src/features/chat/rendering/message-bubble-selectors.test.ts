import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

import { appendPastedTextsToPrompt, createComposerPastedText } from '../pasted-text/pasted-text'
import {
  readMessageDisplayText,
  readUserDisplayText,
  readUserTextDisplay,
} from './message-bubble-selectors'

function userMessage(text: string): UIMessage {
  return { id: 'user-1', role: 'user', parts: [{ type: 'text', text }] }
}

describe('pasted-text message display projection', () => {
  it('separates visible prompt text, structured cards, and safe copy text', () => {
    const serialized = appendPastedTextsToPrompt('Review this', [
      createComposerPastedText('alpha\nbeta', 'paste-1'),
    ])

    expect(readUserTextDisplay(serialized)).toMatchObject({
      displayText: 'Review this',
      pastedTexts: [{ text: 'alpha\nbeta' }],
      plainText: 'Review this\n\nalpha\nbeta',
    })
    expect(readUserDisplayText(serialized)).toBe('Review this')
    expect(readMessageDisplayText(userMessage(serialized))).toBe('Review this\n\nalpha\nbeta')
    expect(readMessageDisplayText(userMessage(serialized))).not.toContain('<pasted_text>')
  })

  it('preserves goal display behavior before adding pasted bodies', () => {
    const serialized = appendPastedTextsToPrompt('/goal Finish the review', [
      createComposerPastedText('supporting context', 'paste-1'),
    ])

    expect(readUserDisplayText(serialized)).toBe('Finish the review')
    expect(readMessageDisplayText(userMessage(serialized))).toBe(
      'Finish the review\n\nsupporting context',
    )
  })
})
