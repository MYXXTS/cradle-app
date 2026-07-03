import { describe, expect, it, vi } from 'vitest'

import { ProviderRuntimeError } from '../../chat-runtime/runtime-provider-types'
import {
  buildProviderToolApprovalRequest,
  requestProviderToolApproval,
} from './permission-bridge'

describe('permission bridge', () => {
  it('builds runtime tool approval requests', () => {
    expect(buildProviderToolApprovalRequest({
      sessionId: 'chat-session-1',
      runId: 'run-1',
      providerRequestId: 'provider-request-1',
      providerKind: 'universal',
      runtimeKind: 'test-runtime',
      providerMethod: 'tool.approval',
      toolCallId: 'tool-call-1',
      metadata: { native: true },
    })).toEqual({
      sessionId: 'chat-session-1',
      runId: 'run-1',
      providerRequestId: 'provider-request-1',
      providerKind: 'universal',
      runtimeKind: 'test-runtime',
      providerMethod: 'tool.approval',
      toolCallId: 'tool-call-1',
      metadata: { native: true },
    })
  })

  it('dispatches tool approval requests through provider context', async () => {
    const requestToolApproval = vi.fn(async request => ({
      requestId: request.providerRequestId,
      approved: true,
    }))

    await expect(requestProviderToolApproval({
      deps: { requestToolApproval },
      sessionId: 'chat-session-1',
      runId: 'run-1',
      providerRequestId: 'provider-request-1',
      providerKind: 'universal',
      runtimeKind: 'test-runtime',
      providerMethod: 'tool.approval',
      toolCallId: 'tool-call-1',
    })).resolves.toEqual({
      requestId: 'provider-request-1',
      approved: true,
    })

    expect(requestToolApproval).toHaveBeenCalledWith({
      sessionId: 'chat-session-1',
      runId: 'run-1',
      providerRequestId: 'provider-request-1',
      providerKind: 'universal',
      runtimeKind: 'test-runtime',
      providerMethod: 'tool.approval',
      toolCallId: 'tool-call-1',
    })
  })

  it('throws a provider runtime error when tool approval handling is unavailable', async () => {
    await expect(requestProviderToolApproval({
      deps: {},
      sessionId: 'chat-session-1',
      runId: 'run-1',
      providerRequestId: 'provider-request-1',
      providerKind: 'universal',
      runtimeKind: 'test-runtime',
      providerMethod: 'tool.approval',
      toolCallId: 'tool-call-1',
    })).rejects.toMatchObject({
      providerError: {
        _tag: 'request_failed',
        provider: 'test-runtime',
        method: 'tool.approval',
        detail: 'Chat Runtime does not expose pending tool approval handling',
      },
    })

    await expect(requestProviderToolApproval({
      deps: {},
      sessionId: 'chat-session-1',
      runId: 'run-1',
      providerRequestId: 'provider-request-1',
      providerKind: 'universal',
      runtimeKind: 'test-runtime',
      providerMethod: 'tool.approval',
      toolCallId: 'tool-call-1',
    })).rejects.toBeInstanceOf(ProviderRuntimeError)
  })

  it('short-circuits via policy.resolveOverride without dispatching to the runtime hook', async () => {
    const requestToolApproval = vi.fn(async request => ({
      requestId: request.providerRequestId,
      approved: true,
    }))
    const onBeforeDispatch = vi.fn()

    await expect(requestProviderToolApproval({
      deps: { requestToolApproval },
      sessionId: 'chat-session-1',
      runId: 'run-1',
      providerRequestId: 'provider-request-1',
      providerKind: 'universal',
      runtimeKind: 'test-runtime',
      providerMethod: 'tool.approval',
      toolCallId: 'tool-call-1',
      policy: {
        resolveOverride: () => ({ requestId: 'provider-request-1', approved: false, reason: 'blocked by policy' }),
        onBeforeDispatch,
      },
    })).resolves.toEqual({
      requestId: 'provider-request-1',
      approved: false,
      reason: 'blocked by policy',
    })

    expect(requestToolApproval).not.toHaveBeenCalled()
    expect(onBeforeDispatch).not.toHaveBeenCalled()
  })

  it('runs policy.onBeforeDispatch and policy.describeRequest only when dispatching for real', async () => {
    const requestToolApproval = vi.fn(async request => ({
      requestId: request.providerRequestId,
      approved: true,
    }))
    const onBeforeDispatch = vi.fn()

    await requestProviderToolApproval({
      deps: { requestToolApproval },
      sessionId: 'chat-session-1',
      runId: 'run-1',
      providerRequestId: 'provider-request-1',
      providerKind: 'universal',
      runtimeKind: 'test-runtime',
      providerMethod: 'tool.approval',
      toolCallId: 'tool-call-1',
      metadata: { toolName: 'shell' },
      policy: {
        resolveOverride: () => null,
        describeRequest: metadata => ({ ...metadata, agentId: 'agent-1' }),
        onBeforeDispatch,
      },
    })

    expect(onBeforeDispatch).toHaveBeenCalledOnce()
    expect(requestToolApproval).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { toolName: 'shell', agentId: 'agent-1' },
    }))
  })
})
