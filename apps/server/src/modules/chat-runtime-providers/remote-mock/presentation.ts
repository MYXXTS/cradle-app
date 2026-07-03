import type {
  ChatRuntimeCapabilities,
  ChatRuntimeMetadata,
} from '../../chat-runtime/runtime-provider-types'
import type { RuntimeKind } from '../../provider-contracts/types'

export const REMOTE_MOCK_RUNTIME_KIND = 'remote-mock' as RuntimeKind
export const DEFAULT_REMOTE_RUNTIME_KIND = 'mock-remote'

export const REMOTE_MOCK_RUNTIME_METADATA = {
  label: 'Remote Mock',
  description: 'Development runtime that streams through cradle-agentd.',
  providerKinds: ['universal'],
  icon: { key: 'custom' },
  surfaces: ['chat'],
  sortOrder: 90,
  availability: 'dev-only',
  composer: {
    inputMode: 'rich',
    modelSelection: 'provider-model',
    thinking: 'per-model',
  },
  slots: [{
    id: 'remote-mock:goal',
    name: 'goal',
    label: 'Goal',
    description: 'Remote mock goal state.',
    argumentHint: '',
    iconKey: 'goal',
    surfaces: ['composerState', 'runtimePanel'],
  }],
  settingsSchema: {
    type: 'object',
    additionalProperties: true,
    required: ['remoteHostId'],
    properties: {
      remoteHostId: {
        type: 'string',
        title: 'Remote host ID',
      },
      remoteRuntimeKind: {
        type: 'string',
        title: 'Remote runtime kind',
        default: DEFAULT_REMOTE_RUNTIME_KIND,
      },
      remoteWorkspacePath: {
        type: 'string',
        title: 'Remote workspace path',
      },
    },
  },
} satisfies ChatRuntimeMetadata

export const REMOTE_MOCK_RUNTIME_CAPABILITIES = {
  supportsSteerTurn: true,
  supportsShellExecution: false,
  supportsLastTurnRollback: false,
  supportsRuntimeSettings: false,
  supportsUiSlotStates: false,
  supportsDynamicCapabilities: false,
  supportsTitleGeneration: false,
  sessionModelSwitch: 'restart-session',
} satisfies ChatRuntimeCapabilities
