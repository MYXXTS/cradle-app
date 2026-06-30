/**
 * Output: opencode prompt parts projected from Chat Runtime input.
 * Input: Cradle UIMessage.
 * Position: opencode provider package boundary from Cradle message input to opencode session.prompt body.
 */

import type { UIMessage } from 'ai'
import type { TextPartInput } from '@opencode-ai/sdk'

import type { StreamTurnInput } from '../../chat-runtime/runtime-provider-types'
import { extractUiMessageText, projectTextOnlyInput } from '../../chat-runtime/ui-message-input'

export function projectOpencodePromptParts(message: StreamTurnInput['message']): TextPartInput[] {
  return [{
    type: 'text',
    text: projectTextOnlyInput(message, 'opencode provider'),
  }]
}

export function readOpencodeSlashCommandInvocation(
  message: StreamTurnInput['message'],
): { command: string; arguments: string } | null {
  const text = projectTextOnlyInput(message, 'opencode slash command').trim()
  if (!text.startsWith('/')) {
    return null
  }
  const body = text.slice(1)
  const commandEnd = body.search(/\s/)
  const command = (commandEnd === -1 ? body : body.slice(0, commandEnd)).trim()
  if (!command) {
    return null
  }
  return {
    command,
    arguments: commandEnd === -1 ? '' : body.slice(commandEnd).trim(),
  }
}

export function projectOpencodeQuickQuestionParts(input: {
  question: string
  transcript: UIMessage[]
}): TextPartInput[] {
  return [{
    type: 'text',
    text: [
      'Answer the quick question using the transcript context below. Do not modify files or persist this as a normal chat turn.',
      '',
      '<transcript>',
      ...input.transcript.map(formatTranscriptMessage),
      '</transcript>',
      '',
      '<question>',
      input.question.trim(),
      '</question>',
    ].join('\n'),
  }]
}

function formatTranscriptMessage(message: UIMessage): string {
  const text = extractUiMessageText(message).trim()
  if (!text) {
    return `${message.role}: [non-text content omitted]`
  }
  return `${message.role}: ${text}`
}
