import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

import { appendPastedTextsToPrompt, createComposerPastedText } from '../pasted-text/pasted-text'
import {
  readMinimapMessageText,
  readShareExportTitle,
  readShareMessagePreview,
} from './chat-read-surface-projection'

const serialized = appendPastedTextsToPrompt('Review this', [
  createComposerPastedText('alpha\nbeta', 'paste-1'),
])
const message: UIMessage = {
  id: 'user-1',
  role: 'user',
  parts: [{ type: 'text', text: serialized }],
}

describe('pasted-text read surfaces', () => {
  it('suppresses transport syntax in minimap previews', () => {
    expect(readMinimapMessageText(message)).toBe('Review this\n\nalpha\nbeta')
    expect(readMinimapMessageText(message)).not.toContain('<pasted_text>')
  })

  it('suppresses transport syntax in share previews and titles', () => {
    expect(readShareMessagePreview(message)).toBe('Review this alpha beta')
    expect(readShareExportTitle([message])).toBe('Review this alpha beta')
    expect(readShareExportTitle([message])).not.toContain('[{"text"')
  })
})
