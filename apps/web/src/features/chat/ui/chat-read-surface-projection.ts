import type { UIMessage } from 'ai'

import { readMessageDisplayText } from '../rendering/message-bubble-selectors'

const WHITESPACE_RE = /\s+/g

export function readMinimapMessageText(message: UIMessage): string {
  return readMessageDisplayText(message).trim()
}

export function readShareMessagePreview(message: UIMessage): string {
  const text = readMessageDisplayText(message).trim().replace(WHITESPACE_RE, ' ')

  if (text) {
    return text
  }

  const hasFile = message.parts.some(part => part.type === 'file')
  if (hasFile) {
    return 'File attachment'
  }

  const hasTool = message.parts.some(part => part.type === 'dynamic-tool')
  if (hasTool) {
    return 'Tool activity'
  }

  return 'Message content'
}

export function readShareExportTitle(messages: UIMessage[]): string {
  const text = messages
    .map(message => readMessageDisplayText(message))
    .join(' ')
    .trim()
    .replace(WHITESPACE_RE, ' ')

  if (!text) {
    return 'Conversation'
  }

  return text.length > 42 ? `${text.slice(0, 42)}...` : text
}
