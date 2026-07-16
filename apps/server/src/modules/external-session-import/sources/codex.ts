import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'

import type { UIMessage } from 'ai'
import { z } from 'zod'

import {
  compactText,
  createCandidateId,
  createContentHash,
  createImportedMessageId,
  createSourceRevision,
  importedMessage,
  safeJsonValue,
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

const CodexGitSchema = z.object({
  commit_hash: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  repository_url: z.string().nullable().optional(),
}).passthrough()

const CodexSessionMetaSchema = z.object({
  id: z.string(),
  timestamp: z.union([z.string(), z.number()]).nullable().optional(),
  cwd: z.string().min(1),
  source: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  git: CodexGitSchema.nullable().optional(),
  parent_thread_id: z.string().nullable().optional(),
  forked_from_id: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
}).passthrough()

const CodexEnvelopeSchema = z.object({
  type: z.string(),
  timestamp: z.union([z.string(), z.number()]).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

const CodexMessageItemSchema = z.object({
  type: z.literal('message'),
  role: z.string(),
  content: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
    image_url: z.string().optional(),
  }).passthrough()),
}).passthrough()

const CodexReasoningItemSchema = z.object({
  type: z.literal('reasoning'),
  summary: z.array(z.union([
    z.string(),
    z.object({ text: z.string() }).passthrough(),
  ])).optional(),
  content: z.array(z.union([
    z.string(),
    z.object({ text: z.string() }).passthrough(),
  ])).optional(),
}).passthrough()

const CodexFunctionCallSchema = z.object({
  type: z.enum(['function_call', 'custom_tool_call']),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string().optional(),
  input: z.unknown().optional(),
}).passthrough()

const CodexFunctionOutputSchema = z.object({
  type: z.enum(['function_call_output', 'custom_tool_call_output']),
  call_id: z.string(),
  output: z.unknown(),
}).passthrough()

type MutableToolPart = UIMessage['parts'][number] & {
  toolCallId?: string
  state?: string
  output?: unknown
}

interface CodexRolloutRoots {
  current: string
  archived: string
}

interface CodexRolloutMetadata {
  descriptor: ExternalSessionDescriptor
  sourceKind: string
  parentThreadId: string | null
  treeSessionId: string | null
}

export interface CodexSessionSourceOptions {
  roots?: CodexRolloutRoots
  concurrency?: number
}

export function createCodexSessionSource(
  options: CodexSessionSourceOptions = {},
): ExternalSessionSourceAdapter {
  const roots = options.roots ?? {
    current: join(homedir(), '.codex', 'sessions'),
    archived: join(homedir(), '.codex', 'archived_sessions'),
  }
  return {
    sourceApp: 'codex',
    async discover(input) {
      return await discoverCodexSessions(roots, input, options.concurrency ?? 24)
    },
    async read(input) {
      return await readCodexSession(input.descriptor)
    },
  }
}

async function discoverCodexSessions(
  roots: CodexRolloutRoots,
  input: ExternalSessionDiscoverInput,
  concurrency: number,
): Promise<ExternalSessionDescriptor[]> {
  const [currentPaths, archivedPaths] = await Promise.all([
    listJsonlFiles(roots.current),
    listJsonlFiles(roots.archived),
  ])
  const paths = [
    ...currentPaths.map(path => ({ path, archived: false })),
    ...archivedPaths.map(path => ({ path, archived: true })),
  ]
  const metadata = (await mapConcurrent(paths, concurrency, async file =>
    await readCodexRolloutMetadata(file.path, file.archived, input.sourceHostId)))
    .filter((entry): entry is CodexRolloutMetadata => entry !== null)

  const childCounts = new Map<string, number>()
  for (const entry of metadata) {
    if (entry.sourceKind !== 'subagent') {
      continue
    }
    const parentKey = entry.parentThreadId ?? entry.treeSessionId
    if (parentKey) {
      childCounts.set(parentKey, (childCounts.get(parentKey) ?? 0) + 1)
    }
  }

  return metadata
    .filter(entry => entry.sourceKind !== 'subagent')
    .map(entry => ({
      ...entry.descriptor,
      childSessionCount: childCounts.get(entry.descriptor.externalSessionId)
        ?? childCounts.get(entry.treeSessionId ?? '')
        ?? 0,
    }))
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
    .slice(0, input.limit ?? 2_000)
}

async function readCodexRolloutMetadata(
  path: string,
  archived: boolean,
  sourceHostId: string,
): Promise<CodexRolloutMetadata | null> {
  const fileStat = await stat(path).catch(() => null)
  if (!fileStat?.isFile()) {
    return null
  }
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  let meta: z.infer<typeof CodexSessionMetaSchema> | null = null
  let firstUserText = ''
  try {
    for await (const line of lines) {
      const envelope = parseCodexEnvelope(line)
      if (!envelope) {
        continue
      }
      if (envelope.type === 'session_meta' && envelope.payload) {
        const parsedMeta = CodexSessionMetaSchema.safeParse(envelope.payload)
        if (parsedMeta.success) {
          meta = parsedMeta.data
          if (readCodexSourceKind(meta.source) === 'subagent') {
            break
          }
        }
        continue
      }
      if (envelope.type !== 'response_item' || !envelope.payload) {
        continue
      }
      const item = CodexMessageItemSchema.safeParse(envelope.payload)
      if (!item.success || item.data.role !== 'user') {
        continue
      }
      firstUserText = readCodexContentText(item.data.content)
      if (firstUserText) {
        break
      }
    }
  }
  finally {
    lines.close()
  }
  if (!meta) {
    return null
  }
  const sourceKind = readCodexSourceKind(meta.source)
  const updatedAt = Math.floor(fileStat.mtimeMs / 1000)
  const git = meta.git
  const descriptor: ExternalSessionDescriptor = {
    candidateId: createCandidateId({
      sourceHostId,
      sourceApp: 'codex',
      externalSessionId: meta.id,
    }),
    sourceHostId,
    sourceApp: 'codex',
    externalSessionId: meta.id,
    sourcePath: path,
    sourceRevision: createSourceRevision({
      externalSessionId: meta.id,
      modifiedAt: updatedAt,
      size: fileStat.size,
    }),
    title: titleFromText(firstUserText, `Codex session ${meta.id.slice(0, 8)}`),
    summary: firstUserText ? compactText(firstUserText, 180) : null,
    workspacePath: meta.cwd,
    gitIdentity: {
      originUrl: git?.repository_url ?? null,
      repoRoot: null,
      branch: git?.branch ?? null,
      headSha: git?.commit_hash ?? null,
    },
    createdAt: unixSeconds(meta.timestamp ?? null),
    updatedAt,
    archived,
    estimatedBytes: fileStat.size,
    childSessionCount: null,
  }
  return {
    descriptor,
    sourceKind,
    parentThreadId: meta.parent_thread_id ?? null,
    treeSessionId: meta.session_id ?? null,
  }
}

async function readCodexSession(
  descriptor: ExternalSessionDescriptor,
): Promise<ExternalSessionReadResult> {
  if (!descriptor.sourcePath) {
    throw new Error(`Codex session ${descriptor.externalSessionId} has no rollout path`)
  }
  const before = await stat(descriptor.sourcePath)
  const observedRevision = createSourceRevision({
    externalSessionId: descriptor.externalSessionId,
    modifiedAt: Math.floor(before.mtimeMs / 1000),
    size: before.size,
  })
  if (observedRevision !== descriptor.sourceRevision) {
    throw new Error('Codex source session changed after preview; scan again before importing')
  }

  const fidelity: ExternalSessionFidelityReport = {
    messages: 0,
    toolCalls: 0,
    reasoningParts: 0,
    omittedSystemEntries: 0,
    unavailableAttachments: 0,
    childSessions: descriptor.childSessionCount ?? 0,
  }
  const messages: ExternalSessionImportMessage[] = []
  let pendingAssistant: ExternalSessionImportMessage | null = null
  let lineNumber = 0
  const lines = createInterface({
    input: createReadStream(descriptor.sourcePath),
    crlfDelay: Infinity,
  })

  const flushAssistant = () => {
    if (!pendingAssistant || pendingAssistant.message.parts.length === 0) {
      pendingAssistant = null
      return
    }
    messages.push(pendingAssistant)
    pendingAssistant = null
  }

  for await (const line of lines) {
    lineNumber += 1
    const envelope = parseCodexEnvelope(line)
    if (!envelope || envelope.type !== 'response_item' || !envelope.payload) {
      continue
    }
    const sourceEntryId = `line-${lineNumber}`
    const createdAt = unixSeconds(envelope.timestamp ?? null)
    const messageItem = CodexMessageItemSchema.safeParse(envelope.payload)
    if (messageItem.success) {
      if (messageItem.data.role === 'developer' || messageItem.data.role === 'system') {
        fidelity.omittedSystemEntries += 1
        continue
      }
      if (messageItem.data.role === 'user') {
        flushAssistant()
        const parts = codexUserParts(messageItem.data.content, fidelity)
        if (parts.length > 0) {
          messages.push(importedMessage({
            id: importedMessageId(descriptor, sourceEntryId),
            role: 'user',
            parts,
            sourceEntryIds: [sourceEntryId],
            createdAt,
            descriptor,
          }))
        }
        continue
      }
      if (messageItem.data.role === 'assistant') {
        pendingAssistant = ensurePendingAssistant(
          pendingAssistant,
          descriptor,
          sourceEntryId,
          createdAt,
        )
        for (const content of messageItem.data.content) {
          if (content.type === 'output_text' && content.text) {
            pendingAssistant.message.parts.push({ type: 'text', text: content.text })
          }
        }
        continue
      }
    }

    const reasoningItem = CodexReasoningItemSchema.safeParse(envelope.payload)
    if (reasoningItem.success) {
      const reasoningText = readCodexReasoning(reasoningItem.data)
      if (reasoningText) {
        pendingAssistant = ensurePendingAssistant(
          pendingAssistant,
          descriptor,
          sourceEntryId,
          createdAt,
        )
        pendingAssistant.message.parts.push({ type: 'reasoning', text: reasoningText })
        fidelity.reasoningParts += 1
      }
      continue
    }

    const callItem = CodexFunctionCallSchema.safeParse(envelope.payload)
    if (callItem.success) {
      pendingAssistant = ensurePendingAssistant(
        pendingAssistant,
        descriptor,
        sourceEntryId,
        createdAt,
      )
      pendingAssistant.message.parts.push({
        type: `tool-${callItem.data.name}`,
        toolCallId: callItem.data.call_id,
        state: 'input-available',
        input: callItem.data.arguments
          ? safeJsonValue(callItem.data.arguments)
          : callItem.data.input ?? {},
      } as UIMessage['parts'][number])
      fidelity.toolCalls += 1
      continue
    }

    const outputItem = CodexFunctionOutputSchema.safeParse(envelope.payload)
    if (outputItem.success) {
      applyCodexToolOutput(pendingAssistant, outputItem.data.call_id, outputItem.data.output)
    }
  }
  flushAssistant()

  const after = await stat(descriptor.sourcePath)
  const finalRevision = createSourceRevision({
    externalSessionId: descriptor.externalSessionId,
    modifiedAt: Math.floor(after.mtimeMs / 1000),
    size: after.size,
  })
  if (finalRevision !== descriptor.sourceRevision) {
    throw new Error('Codex source session changed while it was being imported; retry after scanning')
  }
  fidelity.messages = messages.length
  return {
    descriptor,
    contentHash: createContentHash(messages),
    messages,
    fidelity,
  }
}

function ensurePendingAssistant(
  current: ExternalSessionImportMessage | null,
  descriptor: ExternalSessionDescriptor,
  sourceEntryId: string,
  createdAt: number | null,
): ExternalSessionImportMessage {
  if (current) {
    current.sourceEntryIds.push(sourceEntryId)
    const metadata = current.message.metadata as {
      externalImport: { sourceEntryIds: string[] }
    }
    metadata.externalImport.sourceEntryIds = [...current.sourceEntryIds]
    return current
  }
  return importedMessage({
    id: importedMessageId(descriptor, sourceEntryId),
    role: 'assistant',
    parts: [],
    sourceEntryIds: [sourceEntryId],
    createdAt,
    descriptor,
  })
}

function codexUserParts(
  content: z.infer<typeof CodexMessageItemSchema>['content'],
  fidelity: ExternalSessionFidelityReport,
): UIMessage['parts'] {
  const parts: UIMessage['parts'] = []
  for (const item of content) {
    if (item.type === 'input_text' && item.text) {
      parts.push({ type: 'text', text: item.text })
      continue
    }
    if (item.type === 'input_image') {
      fidelity.unavailableAttachments += 1
      parts.push({ type: 'text', text: '[Imported image was unavailable]' })
    }
  }
  return parts
}

function applyCodexToolOutput(
  assistant: ExternalSessionImportMessage | null,
  toolCallId: string,
  output: unknown,
): void {
  if (!assistant) {
    return
  }
  const part = assistant.message.parts.find((candidate) => {
    const toolPart = candidate as MutableToolPart
    return toolPart.toolCallId === toolCallId
  }) as MutableToolPart | undefined
  if (!part) {
    return
  }
  part.state = 'output-available'
  part.output = typeof output === 'string' ? safeJsonValue(output) : output
}

function readCodexContentText(
  content: z.infer<typeof CodexMessageItemSchema>['content'],
): string {
  return content
    .filter(item => item.type === 'input_text' || item.type === 'output_text')
    .map(item => item.text ?? '')
    .filter(Boolean)
    .join('\n')
}

function readCodexReasoning(
  item: z.infer<typeof CodexReasoningItemSchema>,
): string {
  const values = item.summary?.length ? item.summary : item.content ?? []
  return values
    .map(value => typeof value === 'string' ? value : value.text)
    .filter(Boolean)
    .join('\n')
}

function readCodexSourceKind(source: z.infer<typeof CodexSessionMetaSchema>['source']): string {
  if (typeof source === 'string') {
    return source
  }
  if (!source) {
    return 'unknown'
  }
  const keys = Object.keys(source)
  return keys[0] ?? 'unknown'
}

function parseCodexEnvelope(line: string): z.infer<typeof CodexEnvelopeSchema> | null {
  if (!line.trim()) {
    return null
  }
  try {
    const parsed = CodexEnvelopeSchema.safeParse(JSON.parse(line))
    return parsed.success ? parsed.data : null
  }
  catch {
    return null
  }
}

async function listJsonlFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    await Promise.all(entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(path)
      }
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(path)
      }
    }))
  }
  await visit(root)
  return files
}

async function mapConcurrent<TInput, TOutput>(
  inputs: TInput[],
  concurrency: number,
  mapper: (input: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results = Array.from({ length: inputs.length })
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
    while (nextIndex < inputs.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(inputs[index]!)
    }
  })
  await Promise.all(workers)
  return results
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

export function codexRolloutName(path: string): string {
  return basename(path, '.jsonl')
}
