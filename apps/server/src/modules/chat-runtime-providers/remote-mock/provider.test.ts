import { readFileSync } from 'node:fs'

import type { UIMessage, UIMessageChunk } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RuntimeRegistry } from '../../chat-runtime/chat-runtime-provider-registry'
import type { RuntimeProviderTargetProfile, RuntimeSession } from '../../chat-runtime/runtime-provider-types'
import { assertValidProviderChunkSequence } from '../kit/testing/chunk-contract'
import { RemoteMockProvider } from './provider'

const remoteHostMocks = vi.hoisted(() => ({
  callRemoteHost: vi.fn(),
  connectRemoteHost: vi.fn(async () => undefined),
  openRemoteHostStream: vi.fn(async function* () {
    yield { kind: 'chunk', chunk: { type: 'text-start', id: 'text-1' } }
    yield { kind: 'chunk', chunk: { type: 'text-delta', id: 'text-1', delta: 'Remote answer' } }
    yield { kind: 'chunk', chunk: { type: 'text-end', id: 'text-1' } }
    yield { kind: 'chunk', chunk: { type: 'finish', finishReason: 'stop' } }
  }),
  readRemoteHostAgentdSessionLink: vi.fn(() => ({
    chatSessionId: 'chat-session-1',
    remoteHostId: 'remote-host-1',
    remoteAgentId: 'remote-agent-1',
    remoteRuntimeKind: 'mock-remote',
    providerSessionId: null,
    stateSnapshotJson: null,
  })),
  startRemoteAgent: vi.fn(),
  upsertRemoteHostAgentdSessionLink: vi.fn(),
}))

vi.mock('../../remote-hosts/service', () => remoteHostMocks)

describe('remote mock provider', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the server provider facade within the kit acceptance budget', () => {
    const providerSource = readFileSync(new URL('./provider.ts', import.meta.url), 'utf8')
    const lineCount = providerSource.trimEnd().split('\n').length

    expect(lineCount).toBeLessThanOrEqual(350)
  })

  it('publishes descriptor-driven goal slot and settings schema metadata', async () => {
    const registry = new RuntimeRegistry()
    registry.register(new RemoteMockProvider())

    const descriptors = await registry.listDescriptors()
    const descriptor = descriptors.find(item => item.runtimeKind === 'remote-mock')

    expect(descriptor).toEqual(expect.objectContaining({
      availability: 'dev-only',
      settingsSchema: expect.objectContaining({
        required: ['remoteHostId'],
        properties: expect.objectContaining({
          remoteHostId: expect.objectContaining({ type: 'string' }),
          remoteRuntimeKind: expect.objectContaining({ default: 'mock-remote' }),
        }),
      }),
      slots: expect.arrayContaining([
        expect.objectContaining({
          id: 'remote-mock:goal',
          name: 'goal',
          iconKey: 'goal',
          surfaces: expect.arrayContaining(['composerState']),
        }),
      ]),
    }))
  })

  it('streams remote agent chunks as a valid provider chunk sequence', async () => {
    const provider = new RemoteMockProvider()
    const chunks: UIMessageChunk[] = []

    for await (const chunk of provider.streamTurn({
      runId: 'run-remote',
      runtimeSession: createRuntimeSession(),
      profile: createProfile(),
      message: createUserMessage('Hello remote'),
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/workspace',
    })) {
      chunks.push(chunk)
    }

    expect(chunks.map(chunk => chunk.type)).toEqual([
      'text-start',
      'text-delta',
      'text-end',
      'finish',
    ])
    assertValidProviderChunkSequence(chunks)
    expect(remoteHostMocks.openRemoteHostStream).toHaveBeenCalledWith('remote-host-1', 'agent/turn', expect.objectContaining({
      chatSessionId: 'chat-session-1',
      remoteAgentId: 'remote-agent-1',
      runId: 'run-remote',
    }))
  })
})

function createProfile(): RuntimeProviderTargetProfile {
  return {
    id: 'profile-remote',
    name: 'Remote Mock',
    providerKind: 'universal',
    enabled: true,
    configJson: JSON.stringify({
      remoteHostId: 'remote-host-1',
      remoteRuntimeKind: 'mock-remote',
    }),
    credentialRef: null,
    customModels: '[]',
    iconSlug: null,
    providerTargetKind: 'manual',
    providerTargetId: 'profile-remote',
  }
}

function createRuntimeSession(): RuntimeSession {
  return {
    id: 'runtime-session-1',
    chatSessionId: 'chat-session-1',
    providerTargetId: 'profile-remote',
    runtimeKind: 'remote-mock',
    providerSessionId: null,
    providerStateSnapshot: JSON.stringify({
      remote: {
        hostId: 'remote-host-1',
        agentId: 'remote-agent-1',
        runtimeKind: 'mock-remote',
        updatedAt: 1,
      },
      models: { currentModelId: null },
    }),
  }
}

function createUserMessage(text: string): UIMessage {
  return {
    id: 'user-1',
    role: 'user',
    parts: [{ type: 'text', text }],
  }
}
