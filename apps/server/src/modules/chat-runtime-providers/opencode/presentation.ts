/**
 * Output: opencode runtime presentation projection.
 * Input: opencode SDK command records.
 * Position: opencode provider package boundary from SDK-native presentation to Chat Runtime presentation.
 */

import type { Command as OpencodeCommand } from '@opencode-ai/sdk'

import type {
  RuntimePresentationCapabilities,
  RuntimeSlashCommand,
  RuntimeUiSlot,
} from '../../chat-runtime/runtime-provider-types'
import { OPENCODE_RUNTIME_KIND } from './metadata'

const OPENCODE_QUICK_QUESTION_SLOT: RuntimeUiSlot = {
  id: 'opencode:quick-question',
  name: 'btw',
  label: 'Quick question',
  description: 'Ask a quick question without saving it to history.',
  argumentHint: '[question]',
  aliases: ['quick-question'],
  iconKey: 'quick-question',
  commandText: '/btw ',
  surfaces: ['slashCommand', 'composerState'],
}

const OPENCODE_STATUS_SLOT: RuntimeUiSlot = {
  id: 'opencode:status',
  name: 'status',
  label: 'Status',
  description: 'Show the current opencode session status.',
  argumentHint: '',
  iconKey: 'status',
  commandText: '/status ',
  surfaces: ['runtimePanel'],
}

const OPENCODE_MODEL_SLOT: RuntimeUiSlot = {
  id: 'opencode:model',
  name: 'model',
  label: 'Model',
  description: 'Show the current opencode model.',
  argumentHint: '',
  iconKey: 'model',
  commandText: '/model ',
  surfaces: ['runtimePanel'],
}

const OPENCODE_TERMINAL_SLOT: RuntimeUiSlot = {
  id: 'opencode:terminal',
  name: 'terminal',
  label: 'Terminal',
  description: 'Run shell commands through opencode.',
  argumentHint: '[command]',
  iconKey: 'terminal',
  commandText: '/terminal ',
  surfaces: ['runtimePanel'],
}

export function createOpencodeRuntimePresentation(
  commands: OpencodeCommand[] = [],
): RuntimePresentationCapabilities {
  return {
    runtimeKind: OPENCODE_RUNTIME_KIND,
    slashCommands: commands.map(projectOpencodeSlashCommand),
    uiSlots: [
      OPENCODE_QUICK_QUESTION_SLOT,
      OPENCODE_STATUS_SLOT,
      OPENCODE_MODEL_SLOT,
      OPENCODE_TERMINAL_SLOT,
    ],
    skills: [],
  }
}

function projectOpencodeSlashCommand(command: OpencodeCommand): RuntimeSlashCommand {
  return {
    name: command.name,
    description: command.description ?? '',
    argumentHint: '',
  }
}
