import type { AssistantMessage as OpencodeAssistantMessage, Config, Message as OpencodeMessage, Part as OpencodePart } from '@opencode-ai/sdk'
import type { UIMessageChunk } from 'ai'

import type {
  CancelTurnInput,
  ChatRuntime,
  ExecuteShellCommandInput,
  ExecuteShellCommandResult,
  GenerateSessionTitleInput,
  GetCapabilitiesInput,
  GetUiSlotStatesInput,
  ListRuntimeModelsInput,
  ProviderContext,
  QuickQuestionInput,
  ResumeChatSessionInput,
  RollbackLastTurnInput,
  RollbackLastTurnResult,
  RuntimeModelCatalog,
  RuntimePresentationCapabilities,
  RuntimeSession,
  RuntimeUiSlotState,
  StartChatSessionInput,
  StreamTurnInput,
  TokenUsage,
} from '../../chat-runtime/runtime-provider-types'
import { ProviderErrors, ProviderRuntimeError } from '../../chat-runtime/runtime-provider-types'
import type { RuntimeKind } from '../../provider-contracts/types'
import { readProviderStateSnapshot } from '../provider-state-snapshot'
import { resolveOpencodeConfig } from './config'
import { OpencodeEventStreamProjector } from './event-stream'
import {
  projectOpencodePromptParts,
  projectOpencodeQuickQuestionParts,
  readOpencodeSlashCommandInvocation,
} from './input-projector'
import {
  OPENCODE_RUNTIME_CAPABILITIES,
  OPENCODE_RUNTIME_KIND,
  OPENCODE_RUNTIME_METADATA,
} from './metadata'
import { listOpencodeRuntimeModels, OPENCODE_RUNTIME_NATIVE_PROVIDER_TARGET_ID } from './model-inventory'
import { createOpencodeRuntimePresentation } from './presentation'
import type { OpencodeRuntimeResource } from './runtime-context'
import { acquireOpencodeRuntimeResource } from './runtime-context'

interface OpencodeTurnResult {
  data: {
    info: OpencodeAssistantMessage
    parts: OpencodePart[]
  } | undefined
  error: unknown | undefined
}

export function createOpencodeProvider(ctx: ProviderContext): ChatRuntime {
  return new OpencodeProvider(ctx)
}

export class OpencodeProvider implements ChatRuntime {
  readonly runtimeKind = OPENCODE_RUNTIME_KIND
  readonly metadata = OPENCODE_RUNTIME_METADATA
  readonly capabilities = OPENCODE_RUNTIME_CAPABILITIES

  private _lastUsage: TokenUsage | null = null
  private _lastModelId: string | null = null

  get lastUsage(): TokenUsage | null {
    return this._lastUsage
  }

  get lastModelId(): string | null {
    return this._lastModelId
  }

  constructor(private readonly deps: ProviderContext) {}

  async listModels(input: ListRuntimeModelsInput): Promise<RuntimeModelCatalog> {
    return await listOpencodeRuntimeModels({
      runtimeKind: this.runtimeKind,
      workspacePath: input.workspacePath,
    })
  }

  getDraftPresentation(): RuntimePresentationCapabilities {
    return createOpencodeRuntimePresentation()
  }

  async getPresentation(input: GetCapabilitiesInput): Promise<RuntimePresentationCapabilities> {
    const handle = readOpencodeRuntimeHandle(this.runtimeKind, input.runtimeSession)
    const result = await handle.client.command.list({
      query: { directory: input.workspacePath },
    })
    if (result.error) {
      throw new ProviderRuntimeError(
        ProviderErrors.requestFailed(this.runtimeKind, 'command.list', formatOpencodeError(result.error)),
      )
    }
    return createOpencodeRuntimePresentation(result.data)
  }

  async getUiSlotStates(input: GetUiSlotStatesInput): Promise<RuntimeUiSlotState[]> {
    const providerSessionId = input.runtimeSession.providerSessionId
    if (!providerSessionId) {
      return []
    }

    const snapshot = readProviderStateSnapshot(input.runtimeSession.providerStateSnapshot)
    const modelId = input.modelId ?? snapshot.models.currentModelId ?? null
    const providerModel = parseOpenCodeModelRef(modelId)
    const updatedAt = Date.now()
    return [
      {
        kind: 'status',
        slotId: 'opencode:status',
        threadId: providerSessionId,
        status: 'idle',
        activeFlags: [],
        updatedAt,
      },
      {
        kind: 'model',
        slotId: 'opencode:model',
        threadId: providerSessionId,
        modelId,
        modelLabel: providerModel?.modelID ?? modelId,
        modelProvider: providerModel?.providerID ?? null,
        serviceTier: null,
        supportsImages: null,
        supportsWebSearch: null,
        supportsNamespaceTools: null,
        updatedAt,
      },
    ]
  }

  async startChatSession(input: StartChatSessionInput): Promise<RuntimeSession> {
    const resolved = await this.resolveRuntimeConfig({
      profile: input.profile,
      requestedModelId: input.modelId,
    })
    const lease = await acquireOpencodeRuntimeResource({
      runtimeKind: this.runtimeKind,
      providerTargetId: resolved.hostProviderTargetId,
      chatSessionId: input.chatSessionId,
      config: resolved.config,
      directory: input.workspacePath,
    })

    let leaseTransferred = false
    try {
      const session = await this.createNativeSession(lease.resource, input.workspacePath, input.chatSessionId)
      leaseTransferred = true
      return {
        id: input.chatSessionId,
        chatSessionId: input.chatSessionId,
        providerTargetId: resolved.providerTargetId,
        runtimeKind: this.runtimeKind,
        providerSessionId: session.id,
        providerRuntimeLease: lease,
        providerStateSnapshot: JSON.stringify({
          workspacePath: input.workspacePath,
          models: { currentModelId: resolved.modelId },
          opencode: {
            serverUrl: lease.resource.server.url,
            providerModel: resolved.model,
          },
        }),
      }
    }
    finally {
      if (!leaseTransferred) {
        lease.release()
      }
    }
  }

  async resumeChatSession(input: ResumeChatSessionInput): Promise<RuntimeSession> {
    const resolved = await this.resolveRuntimeConfig({
      profile: input.profile,
      requestedModelId: input.modelId,
    })
    const lease = await acquireOpencodeRuntimeResource({
      runtimeKind: this.runtimeKind,
      providerTargetId: resolved.hostProviderTargetId,
      chatSessionId: input.runtimeSession.chatSessionId,
      config: resolved.config,
      directory: input.workspacePath,
    })

    const snapshot = readProviderStateSnapshot(input.runtimeSession.providerStateSnapshot)
    return {
      ...input.runtimeSession,
      runtimeKind: this.runtimeKind,
      providerRuntimeLease: lease,
      providerStateSnapshot: JSON.stringify({
        ...snapshot,
        workspacePath: input.workspacePath,
        models: { currentModelId: resolved.modelId ?? snapshot.models.currentModelId },
        opencode: {
          serverUrl: lease.resource.server.url,
          providerModel: resolved.model,
        },
      }),
    }
  }

  async* quickQuestion(input: QuickQuestionInput): AsyncGenerator<UIMessageChunk, void, void> {
    const snapshot = readProviderStateSnapshot(input.runtimeSession.providerStateSnapshot)
    const resolved = await this.resolveRuntimeConfig({
      profile: input.profile,
      requestedModelId: snapshot.models.currentModelId,
    })
    const resource = readOpencodeRuntimeHandle(this.runtimeKind, input.runtimeSession)
    const session = await this.createNativeSession(
      resource,
      input.workspacePath,
      `${input.runtimeSession.chatSessionId} quick question`,
    )
    const projector = new OpencodeEventStreamProjector(session.id)

    try {
      const result = await resource.client.session.prompt({
        path: { id: session.id },
        query: { directory: input.workspacePath },
        body: {
          ...(resolved.model ? { model: resolved.model } : {}),
          parts: projectOpencodeQuickQuestionParts({
            question: input.question,
            transcript: input.transcript,
          }),
        },
      })

      if (result.error) {
        throw new ProviderRuntimeError(
          ProviderErrors.requestFailed(this.runtimeKind, 'quickQuestion', formatOpencodeError(result.error)),
        )
      }
      if (result.data.info.error) {
        throw new ProviderRuntimeError(
          ProviderErrors.requestFailed(
            this.runtimeKind,
            'quickQuestion',
            formatOpencodeAssistantError(result.data.info.error),
          ),
        )
      }

      for (const chunk of projector.projectPromptResult(result.data)) {
        yield chunk
      }
      yield projector.finish(result.data.info)
    }
    finally {
      await resource.client.session.delete({
        path: { id: session.id },
        query: { directory: input.workspacePath },
      }).catch(() => undefined)
    }
  }

  async generateSessionTitle(input: GenerateSessionTitleInput): Promise<string | null> {
    const providerSessionId = input.runtimeSession.providerSessionId
    if (!providerSessionId) {
      return null
    }

    const handle = readOpencodeRuntimeHandle(this.runtimeKind, input.runtimeSession)
    const resolved = await this.resolveRuntimeConfig({
      profile: input.profile,
      requestedModelId: input.modelId,
    })
    const titleModel = parseOpenCodeModelRef(resolved.config.small_model) ?? resolved.model
    if (!titleModel) {
      return null
    }

    const summarizeResult = await handle.client.session.summarize({
      path: { id: providerSessionId },
      query: { directory: input.workspacePath },
      body: titleModel,
    })
    if (summarizeResult.error) {
      throw new ProviderRuntimeError(
        ProviderErrors.requestFailed(this.runtimeKind, 'session.summarize', formatOpencodeError(summarizeResult.error)),
      )
    }

    const sessionResult = await handle.client.session.get({
      path: { id: providerSessionId },
      query: { directory: input.workspacePath },
    })
    if (sessionResult.error) {
      throw new ProviderRuntimeError(
        ProviderErrors.requestFailed(this.runtimeKind, 'session.get', formatOpencodeError(sessionResult.error)),
      )
    }

    const title = sessionResult.data.title.trim()
    if (!title) {
      return null
    }

    const updateResult = await handle.client.session.update({
      path: { id: providerSessionId },
      query: { directory: input.workspacePath },
      body: { title },
    })
    if (updateResult.error) {
      throw new ProviderRuntimeError(
        ProviderErrors.requestFailed(this.runtimeKind, 'session.update', formatOpencodeError(updateResult.error)),
      )
    }
    return title
  }

  async executeShellCommand(input: ExecuteShellCommandInput): Promise<ExecuteShellCommandResult> {
    const command = input.command.trim()
    if (!command) {
      throw new ProviderRuntimeError(
        ProviderErrors.requestFailed(this.runtimeKind, 'executeShellCommand', 'opencode shell command must not be empty'),
      )
    }

    const providerSessionId = input.runtimeSession.providerSessionId
    if (!providerSessionId) {
      throw new ProviderRuntimeError(ProviderErrors.sessionNotFound(this.runtimeKind, input.runtimeSession.chatSessionId))
    }

    const handle = readOpencodeRuntimeHandle(this.runtimeKind, input.runtimeSession)
    const resolved = await this.resolveRuntimeConfig({
      profile: input.profile,
      requestedModelId: input.modelId,
    })
    const startedAt = Date.now()
    const result = await handle.client.session.shell({
      path: { id: providerSessionId },
      query: { directory: input.workspacePath },
      body: {
        agent: 'build',
        ...(resolved.model ? { model: resolved.model } : {}),
        command,
      },
      signal: input.signal,
    })
    if (result.error) {
      throw new ProviderRuntimeError(
        ProviderErrors.requestFailed(this.runtimeKind, 'session.shell', formatOpencodeError(result.error)),
      )
    }
    if (result.data.error) {
      throw new ProviderRuntimeError(
        ProviderErrors.requestFailed(this.runtimeKind, 'session.shell', formatOpencodeAssistantError(result.data.error)),
      )
    }

    const messageResult = await handle.client.session.message({
      path: { id: providerSessionId, messageID: result.data.id },
      query: { directory: input.workspacePath },
    })
    if (messageResult.error) {
      throw new ProviderRuntimeError(
        ProviderErrors.requestFailed(this.runtimeKind, 'session.message', formatOpencodeError(messageResult.error)),
      )
    }

    const shell = projectOpencodeShellResult(messageResult.data.parts)
    return {
      command,
      stdout: shell.stdout,
      stderr: shell.stderr,
      exitCode: null,
      durationMs: shell.durationMs ?? Math.max(0, Date.now() - startedAt),
      timedOut: false,
      truncated: false,
    }
  }

  async rollbackLastTurn(input: RollbackLastTurnInput): Promise<RollbackLastTurnResult> {
    const providerSessionId = input.runtimeSession.providerSessionId
    if (!providerSessionId) {
      throw new ProviderRuntimeError(ProviderErrors.sessionNotFound(this.runtimeKind, input.runtimeSession.chatSessionId))
    }

    const handle = readOpencodeRuntimeHandle(this.runtimeKind, input.runtimeSession)
    const messagesResult = await handle.client.session.messages({
      path: { id: providerSessionId },
      query: { directory: input.workspacePath, limit: 50 },
    })
    if (messagesResult.error) {
      throw new ProviderRuntimeError(
        ProviderErrors.requestFailed(this.runtimeKind, 'session.messages', formatOpencodeError(messagesResult.error)),
      )
    }

    const message = readLastAssistantMessage(messagesResult.data)
    if (!message) {
      return {
        runtimeKind: this.runtimeKind,
        providerSessionId,
        rolledBackTurns: 0,
        fileChangesReverted: false,
      }
    }

    const revertResult = await handle.client.session.revert({
      path: { id: providerSessionId },
      query: { directory: input.workspacePath },
      body: { messageID: message.id },
    })
    if (revertResult.error) {
      throw new ProviderRuntimeError(
        ProviderErrors.requestFailed(this.runtimeKind, 'session.revert', formatOpencodeError(revertResult.error)),
      )
    }

    return {
      runtimeKind: this.runtimeKind,
      providerSessionId,
      rolledBackTurns: 1,
      fileChangesReverted: false,
      providerResult: revertResult.data,
    }
  }

  async* streamTurn(input: StreamTurnInput): AsyncGenerator<UIMessageChunk, void, void> {
    const opencodeSessionId = input.runtimeSession.providerSessionId
    const lease = input.runtimeSession.providerRuntimeLease
    if (!opencodeSessionId || !lease) {
      throw new ProviderRuntimeError(ProviderErrors.sessionNotFound(this.runtimeKind, input.runtimeSession.chatSessionId))
    }

    const resolved = await this.resolveRuntimeConfig({
      profile: input.profile,
      requestedModelId: input.modelId,
    })
    this._lastUsage = null
    this._lastModelId = resolved.modelId

    const resource = lease.resource as OpencodeRuntimeResource
    const projector = new OpencodeEventStreamProjector(opencodeSessionId)
    const chunks = new AsyncChunkQueue()
    const eventAbortController = new AbortController()

    try {
      const subscription = await resource.client.event.subscribe({
        ...(input.workspacePath ? { query: { directory: input.workspacePath } } : {}),
        signal: eventAbortController.signal,
        sseMaxRetryAttempts: 0,
      })
      void (async () => {
        try {
          for await (const event of subscription.stream) {
            for (const chunk of projector.projectEvent(event)) {
              chunks.push(chunk)
            }
          }
        }
        catch (error) {
          if (!eventAbortController.signal.aborted) {
            chunks.push({
              type: 'data-runtime-event',
              data: {
                kind: 'opencode.event-stream-error',
                message: formatOpencodeError(error),
              },
            })
          }
        }
      })()
    }
    catch {
      // The final prompt response remains a complete recovery path when SSE is unavailable.
    }

    void (async () => {
      const submission = await submitOpencodeTurn(resource, {
        sessionId: opencodeSessionId,
        workspacePath: input.workspacePath,
        model: resolved.model,
        systemPrompt: input.systemPrompt,
        message: input.message,
      })
      const { operation, result } = submission

      if (result.error) {
        chunks.fail(new ProviderRuntimeError(
          ProviderErrors.requestFailed(this.runtimeKind, operation, formatOpencodeError(result.error)),
        ))
        return
      }
      const data = result.data
      if (!data) {
        chunks.fail(new ProviderRuntimeError(
          ProviderErrors.requestFailed(this.runtimeKind, operation, 'opencode returned no turn data'),
        ))
        return
      }
      if (data.info.error) {
        chunks.fail(new ProviderRuntimeError(
          ProviderErrors.requestFailed(
            this.runtimeKind,
            operation,
            formatOpencodeAssistantError(data.info.error),
          ),
        ))
        return
      }

      for (const chunk of projector.projectPromptResult(data)) {
        chunks.push(chunk)
      }
      this._lastUsage = projector.usage
      chunks.push(projector.finish(data.info))
      chunks.close()
    })().catch(error => chunks.fail(error))

    try {
      for await (const chunk of chunks) {
        yield chunk
      }
    }
    finally {
      eventAbortController.abort()
    }
  }

  async cancelTurn(input: CancelTurnInput): Promise<void> {
    const opencodeSessionId = input.runtimeSession.providerSessionId
    const lease = input.runtimeSession.providerRuntimeLease
    if (!opencodeSessionId || !lease) {
      return
    }

    try {
      await (lease.resource as OpencodeRuntimeResource).client.session.abort({
        path: { id: opencodeSessionId },
      })
    }
    catch {
      // opencode abort is best-effort from the unified runtime boundary.
    }
  }

  private async createNativeSession(
    resource: OpencodeRuntimeResource,
    workspacePath: string,
    chatSessionId: string,
  ) {
    const result = await resource.client.session.create({
      query: { directory: workspacePath },
      body: { title: `Cradle ${chatSessionId}` },
    })
    if (result.error) {
      throw new ProviderRuntimeError(
        ProviderErrors.requestFailed(this.runtimeKind, 'session.create', formatOpencodeError(result.error)),
      )
    }
    return result.data
  }

  private async resolveRuntimeConfig(input: {
    profile: StartChatSessionInput['profile']
    requestedModelId?: string | null
  }): Promise<{
    config: Config
    model: { providerID: string, modelID: string } | null
    modelId: string | null
    providerTargetId: string | null
    hostProviderTargetId: string
  }> {
    if (input.profile) {
      const resolved = await resolveOpencodeConfig({
        profile: input.profile,
        requestedModelId: input.requestedModelId,
        readSecret: ref => this.deps.readSecret(ref),
      })
      return {
        ...resolved,
        modelId: resolved.requestedModelId,
        providerTargetId: input.profile.providerTargetId,
        hostProviderTargetId: input.profile.providerTargetId,
      }
    }

    const model = parseOpenCodeModelRef(input.requestedModelId)
    return {
      config: {
        ...(input.requestedModelId ? { model: input.requestedModelId } : {}),
      },
      model,
      modelId: input.requestedModelId ?? null,
      providerTargetId: null,
      hostProviderTargetId: OPENCODE_RUNTIME_NATIVE_PROVIDER_TARGET_ID,
    }
  }
}

class AsyncChunkQueue implements AsyncIterable<UIMessageChunk> {
  private readonly values: UIMessageChunk[] = []
  private readonly waiters: Array<{
    resolve: (result: IteratorResult<UIMessageChunk>) => void
    reject: (error: unknown) => void
  }> = []

  private closed = false
  private failure: unknown

  push(value: UIMessageChunk): void {
    if (this.closed) {
      return
    }
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter.resolve({ value, done: false })
      return
    }
    this.values.push(value)
  }

  close(): void {
    this.closed = true
    while (this.waiters.length > 0) {
      this.waiters.shift()?.resolve({ value: undefined, done: true })
    }
  }

  fail(error: unknown): void {
    this.failure = error
    this.closed = true
    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(error)
    }
  }

  async next(): Promise<IteratorResult<UIMessageChunk>> {
    if (this.values.length > 0) {
      return { value: this.values.shift()!, done: false }
    }
    if (this.failure) {
      throw this.failure
    }
    if (this.closed) {
      return { value: undefined, done: true }
    }
    return await new Promise<IteratorResult<UIMessageChunk>>((resolve, reject) => {
      this.waiters.push({ resolve, reject })
    })
  }

  [Symbol.asyncIterator](): AsyncIterator<UIMessageChunk> {
    return this
  }
}

function parseOpenCodeModelRef(modelId: string | null | undefined): { providerID: string, modelID: string } | null {
  if (!modelId) {
    return null
  }
  const slashIndex = modelId.indexOf('/')
  if (slashIndex <= 0 || slashIndex === modelId.length - 1) {
    return null
  }
  return {
    providerID: modelId.slice(0, slashIndex),
    modelID: modelId.slice(slashIndex + 1),
  }
}

function readOpencodeRuntimeHandle(runtimeKind: RuntimeKind, runtimeSession: RuntimeSession): OpencodeRuntimeResource {
  const lease = runtimeSession.providerRuntimeLease
  if (!runtimeSession.providerSessionId || !lease) {
    throw new ProviderRuntimeError(ProviderErrors.sessionNotFound(runtimeKind, runtimeSession.chatSessionId))
  }
  return lease.resource as OpencodeRuntimeResource
}

async function submitOpencodeTurn(
  resource: OpencodeRuntimeResource,
  input: {
    sessionId: string
    workspacePath?: string
    model: { providerID: string, modelID: string } | null
    systemPrompt?: string
    message: StreamTurnInput['message']
  },
): Promise<{
  operation: 'session.command' | 'session.prompt'
  result: OpencodeTurnResult
}> {
  const invocation = readOpencodeSlashCommandInvocation(input.message)
  if (invocation) {
    const commandList = await resource.client.command.list({
      query: { directory: input.workspacePath },
    })
    if (commandList.error) {
      return {
        operation: 'session.prompt',
        result: normalizeOpencodeTurnResult(await resource.client.session.prompt({
          path: { id: input.sessionId },
          query: { directory: input.workspacePath },
          body: {
            ...(input.model ? { model: input.model } : {}),
            ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
            parts: projectOpencodePromptParts(input.message),
          },
        })),
      }
    }

    const command = (commandList.data ?? []).find(candidate => candidate.name === invocation.command)
    if (command) {
      return {
        operation: 'session.command',
        result: normalizeOpencodeTurnResult(await resource.client.session.command({
          path: { id: input.sessionId },
          query: { directory: input.workspacePath },
          body: {
            command: invocation.command,
            arguments: invocation.arguments,
            ...(command.agent ? { agent: command.agent } : {}),
            ...(command.model ? { model: command.model } : {}),
          },
        })),
      }
    }
  }

  return {
    operation: 'session.prompt',
    result: normalizeOpencodeTurnResult(await resource.client.session.prompt({
      path: { id: input.sessionId },
      query: { directory: input.workspacePath },
      body: {
        ...(input.model ? { model: input.model } : {}),
        ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
        parts: projectOpencodePromptParts(input.message),
      },
    })),
  }
}

function normalizeOpencodeTurnResult(result: {
  data?: {
    info: OpencodeAssistantMessage
    parts: OpencodePart[]
  }
  error?: unknown
}): OpencodeTurnResult {
  return {
    data: result.data,
    error: result.error,
  }
}

function readLastAssistantMessage(
  messages: Array<{ info: OpencodeMessage, parts: OpencodePart[] }>,
): OpencodeAssistantMessage | null {
  let selected: OpencodeAssistantMessage | null = null
  for (const message of messages) {
    if (message.info.role !== 'assistant') {
      continue
    }
    if (!selected || message.info.time.created >= selected.time.created) {
      selected = message.info
    }
  }
  return selected
}

function projectOpencodeShellResult(parts: OpencodePart[]): {
  stdout: string
  stderr: string
  durationMs: number | null
} {
  const stdout: string[] = []
  const stderr: string[] = []
  let durationMs: number | null = null

  for (const part of parts) {
    if (part.type === 'text' && part.text) {
      stdout.push(part.text)
      continue
    }
    if (part.type !== 'tool') {
      continue
    }
    switch (part.state.status) {
      case 'completed':
        stdout.push(part.state.output)
        durationMs = readToolDurationMs(part.state.time.start, part.state.time.end, durationMs)
        break
      case 'error':
        stderr.push(part.state.error)
        durationMs = readToolDurationMs(part.state.time.start, part.state.time.end, durationMs)
        break
      case 'pending':
      case 'running':
        break
    }
  }

  return {
    stdout: stdout.join('\n').trim(),
    stderr: stderr.join('\n').trim(),
    durationMs,
  }
}

function readToolDurationMs(startedAt: number, completedAt: number, current: number | null): number {
  const duration = Math.max(0, completedAt - startedAt)
  return current === null ? duration : Math.max(current, duration)
}

function formatOpencodeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return JSON.stringify(error)
}

export function formatOpencodeAssistantError(error: NonNullable<OpencodeAssistantMessage['error']>): string {
  switch (error.name) {
    case 'ProviderAuthError':
      return `Provider authentication failed for ${error.data.providerID}: ${error.data.message}`
    case 'UnknownError':
      return error.data.message
    case 'MessageOutputLengthError':
      return `Message output length exceeded: ${JSON.stringify(error.data)}`
    case 'MessageAbortedError':
      return error.data.message
    case 'APIError':
      return formatOpencodeApiError(error.data)
  }
}

function formatOpencodeApiError(error: Extract<
  NonNullable<OpencodeAssistantMessage['error']>,
  { name: 'APIError' }
>['data']): string {
  return error.statusCode === undefined
    ? error.message
    : `${error.statusCode}: ${error.message}`
}
