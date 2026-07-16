import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type {
  getSessionMessages,
  GetSessionMessagesOptions,
  listSessions,
  ListSessionsOptions,
  listSubagents,
  SessionMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type { UIMessage } from 'ai'
import { z } from 'zod'

import {
  compactText,
  createCandidateId,
  createContentHash,
  createImportedMessageId,
  createSourceRevision,
  emptyGitIdentity,
  importedMessage,
  titleFromText,
  unixSeconds,
} from '../source-utils'
import type {
  ExternalSessionDescriptor,
  ExternalSessionDiscoverInput,
  ExternalSessionFidelityReport,
  ExternalSessionImportMessage,
  ExternalSessionReadResult,
  ExternalSessionSourceAdapter,
} from '../types'
import type {
  ClaudeSourceWorkerRequest,
  ClaudeSourceWorkerResponse,
  ClaudeSourceWorkerResult,
} from './claude-worker-protocol'

const ClaudeContentBlockSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  thinking: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.unknown().optional(),
  tool_use_id: z.string().optional(),
  content: z.unknown().optional(),
  is_error: z.boolean().optional(),
}).passthrough()

const ClaudeMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([
    z.string(),
    z.array(ClaudeContentBlockSchema),
  ]),
}).passthrough()

type ClaudeContentBlock = z.infer<typeof ClaudeContentBlockSchema>
type ClaudeSessionMessage = SessionMessage & { timestamp?: string }
type MutableToolPart = UIMessage['parts'][number] & {
  toolCallId?: string
  state?: string
  output?: unknown
  errorText?: string
}

export interface ClaudeSessionSourceDependencies {
  listSessions: (options?: ListSessionsOptions) => ReturnType<typeof listSessions>
  getSessionMessages: (
    sessionId: string,
    options?: GetSessionMessagesOptions,
  ) => ReturnType<typeof getSessionMessages>
  listSubagents: (sessionId: string) => ReturnType<typeof listSubagents>
}

const defaultDependencies: ClaudeSessionSourceDependencies = {
  listSessions: async options => await runClaudeSourceWorker({
    id: randomUUID(),
    operation: 'list-sessions',
    options,
  }),
  getSessionMessages: async (sessionId, options) => await runClaudeSourceWorker({
    id: randomUUID(),
    operation: 'get-session-messages',
    sessionId,
    options,
  }),
  listSubagents: async sessionId => await runClaudeSourceWorker({
    id: randomUUID(),
    operation: 'list-subagents',
    sessionId,
  }),
}

function runClaudeSourceWorker<T extends ClaudeSourceWorkerResult>(
  request: ClaudeSourceWorkerRequest,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.CLAUDE_CONFIG_DIR
    delete env.CLAUDE_SECURESTORAGE_CONFIG_DIR
    const workerPath = resolveClaudeSourceWorkerPath()
    const child = fork(workerPath, [], {
      env,
      execArgv: workerPath.endsWith('.ts') ? ['--import', 'tsx'] : [],
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Claude session discovery worker timed out'))
    }, 120_000)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout)
        reject(new Error(`Claude session discovery worker exited with code ${code}`))
      }
    })
    child.on('message', (response: ClaudeSourceWorkerResponse) => {
      if (response.id !== request.id) {
        return
      }
      clearTimeout(timeout)
      if (!response.ok) {
        reject(new Error(response.error))
        return
      }
      resolve(response.result as T)
    })
    child.send(request)
  })
}

function resolveClaudeSourceWorkerPath(): string {
  const builtWorker = fileURLToPath(new URL('./claude-external-session-source.js', import.meta.url))
  if (existsSync(builtWorker)) {
    return builtWorker
  }
  return fileURLToPath(new URL('./claude-source-worker.ts', import.meta.url))
}

export function createClaudeSessionSource(
  dependencies: ClaudeSessionSourceDependencies = defaultDependencies,
): ExternalSessionSourceAdapter {
  return {
    sourceApp: 'claude',
    async discover(input) {
      return await discoverClaudeSessions(dependencies, input)
    },
    async read(input) {
      return await readClaudeSession(dependencies, input.descriptor)
    },
  }
}

async function discoverClaudeSessions(
  dependencies: ClaudeSessionSourceDependencies,
  input: ExternalSessionDiscoverInput,
): Promise<ExternalSessionDescriptor[]> {
  const limit = input.limit ?? 2_000
  const sessions = await dependencies.listSessions({
    includeProgrammatic: false,
    limit,
  })

  return sessions
    .filter((session): session is typeof session & { cwd: string } => Boolean(session.cwd))
    .map((session): ExternalSessionDescriptor => {
      const createdAt = unixSeconds(session.createdAt ?? null)
      const updatedAt = unixSeconds(session.lastModified)
      const title = titleFromText(
        session.customTitle ?? session.summary ?? session.firstPrompt ?? '',
        `Claude session ${session.sessionId.slice(0, 8)}`,
      )
      return {
        candidateId: createCandidateId({
          sourceHostId: input.sourceHostId,
          sourceApp: 'claude',
          externalSessionId: session.sessionId,
        }),
        sourceHostId: input.sourceHostId,
        sourceApp: 'claude',
        externalSessionId: session.sessionId,
        sourcePath: null,
        sourceRevision: createSourceRevision({
          externalSessionId: session.sessionId,
          modifiedAt: updatedAt,
          size: session.fileSize ?? null,
        }),
        title,
        summary: session.firstPrompt
          ? compactText(session.firstPrompt, 180)
          : null,
        workspacePath: session.cwd,
        gitIdentity: {
          ...emptyGitIdentity(),
          branch: session.gitBranch ?? null,
        },
        createdAt,
        updatedAt,
        archived: false,
        estimatedBytes: session.fileSize ?? null,
        childSessionCount: null,
      }
    })
}

async function readClaudeSession(
  dependencies: ClaudeSessionSourceDependencies,
  descriptor: ExternalSessionDescriptor,
): Promise<ExternalSessionReadResult> {
  const [entries, subagentIds] = await Promise.all([
    dependencies.getSessionMessages(descriptor.externalSessionId, {
      includeSystemMessages: true,
    }),
    dependencies.listSubagents(descriptor.externalSessionId),
  ])
  const fidelity: ExternalSessionFidelityReport = {
    messages: 0,
    toolCalls: 0,
    reasoningParts: 0,
    omittedSystemEntries: 0,
    unavailableAttachments: 0,
    childSessions: subagentIds.length,
  }
  const messages = projectClaudeMessages(
    entries as ClaudeSessionMessage[],
    descriptor,
    fidelity,
  )
  fidelity.messages = messages.length
  return {
    descriptor: {
      ...descriptor,
      childSessionCount: subagentIds.length,
    },
    contentHash: createContentHash(messages),
    messages,
    fidelity,
  }
}

function projectClaudeMessages(
  entries: ClaudeSessionMessage[],
  descriptor: ExternalSessionDescriptor,
  fidelity: ExternalSessionFidelityReport,
): ExternalSessionImportMessage[] {
  const messages: ExternalSessionImportMessage[] = []
  let pendingAssistant: ExternalSessionImportMessage | null = null

  const flushAssistant = () => {
    if (!pendingAssistant || pendingAssistant.message.parts.length === 0) {
      pendingAssistant = null
      return
    }
    messages.push(pendingAssistant)
    pendingAssistant = null
  }

  for (const entry of entries) {
    if (entry.type === 'system') {
      fidelity.omittedSystemEntries += 1
      continue
    }
    const parsed = ClaudeMessageSchema.safeParse(entry.message)
    if (!parsed.success) {
      fidelity.omittedSystemEntries += 1
      continue
    }
    const blocks = typeof parsed.data.content === 'string'
      ? [{ type: 'text', text: parsed.data.content } satisfies ClaudeContentBlock]
      : parsed.data.content
    const createdAt = unixSeconds(entry.timestamp)

    if (parsed.data.role === 'assistant') {
      pendingAssistant ??= importedMessage({
        id: importedMessageId(descriptor, entry.uuid),
        role: 'assistant',
        parts: [],
        sourceEntryIds: [],
        createdAt,
        descriptor,
      })
      pendingAssistant.sourceEntryIds.push(entry.uuid)
      updateProvenance(pendingAssistant)
      for (const block of blocks) {
        const part = assistantPart(block, fidelity)
        if (part) {
          pendingAssistant.message.parts.push(part)
        }
      }
      continue
    }

    for (const block of blocks) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        applyClaudeToolResult(pendingAssistant, block)
      }
    }
    const parts = userParts(blocks, fidelity)
    if (parts.length === 0) {
      continue
    }
    flushAssistant()
    messages.push(importedMessage({
      id: importedMessageId(descriptor, entry.uuid),
      role: 'user',
      parts,
      sourceEntryIds: [entry.uuid],
      createdAt,
      descriptor,
    }))
  }

  flushAssistant()
  return messages
}

function assistantPart(
  block: ClaudeContentBlock,
  fidelity: ExternalSessionFidelityReport,
): UIMessage['parts'][number] | null {
  if (block.type === 'text' && block.text) {
    return { type: 'text', text: block.text }
  }
  if (block.type === 'thinking' && (block.thinking || block.text)) {
    fidelity.reasoningParts += 1
    return { type: 'reasoning', text: block.thinking ?? block.text ?? '' }
  }
  if (block.type === 'tool_use' && block.id && block.name) {
    fidelity.toolCalls += 1
    return {
      type: `tool-${block.name}`,
      toolCallId: block.id,
      state: 'input-available',
      input: block.input ?? {},
    } as UIMessage['parts'][number]
  }
  return null
}

function userParts(
  blocks: ClaudeContentBlock[],
  fidelity: ExternalSessionFidelityReport,
): UIMessage['parts'] {
  const parts: UIMessage['parts'] = []
  for (const block of blocks) {
    if (block.type === 'text' && block.text) {
      parts.push({ type: 'text', text: block.text })
      continue
    }
    if (block.type === 'image') {
      fidelity.unavailableAttachments += 1
      parts.push({ type: 'text', text: '[Imported image was unavailable]' })
    }
  }
  return parts
}

function applyClaudeToolResult(
  assistant: ExternalSessionImportMessage | null,
  block: ClaudeContentBlock,
): void {
  if (!assistant || !block.tool_use_id) {
    return
  }
  const part = assistant.message.parts.find((candidate) => {
    const toolPart = candidate as MutableToolPart
    return toolPart.toolCallId === block.tool_use_id
  }) as MutableToolPart | undefined
  if (!part) {
    return
  }
  part.state = block.is_error ? 'output-error' : 'output-available'
  if (block.is_error) {
    part.errorText = readClaudeToolResult(block.content)
  }
  else {
    part.output = block.content ?? ''
  }
}

function readClaudeToolResult(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value ?? '')
}

function updateProvenance(message: ExternalSessionImportMessage): void {
  const metadata = message.message.metadata as {
    externalImport: { sourceEntryIds: string[] }
  }
  metadata.externalImport.sourceEntryIds = [...message.sourceEntryIds]
}

function importedMessageId(
  descriptor: ExternalSessionDescriptor,
  sourceEntryId: string,
): string {
  return createImportedMessageId({
    sourceApp: descriptor.sourceApp,
    externalSessionId: descriptor.externalSessionId,
    sourceEntryId,
  })
}
