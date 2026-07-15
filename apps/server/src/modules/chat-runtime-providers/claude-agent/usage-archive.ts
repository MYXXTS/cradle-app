import { readFile } from 'node:fs/promises'

import type { RuntimeTokenUsageBreakdown } from '@cradle/chat-runtime-contracts'

export interface ClaudeArchiveUsageSummary {
  sessionId: string | null
  occurredAt: number
  usage: RuntimeTokenUsageBreakdown
}

type JsonRecord = Record<string, unknown>

export async function readClaudeArchiveUsage(path: string): Promise<ClaudeArchiveUsageSummary | null> {
  let content: string
  try {
    content = await readFile(path, 'utf8')
  }
  catch {
    return null
  }

  const seen = new Set<string>()
  const usage = emptyUsage()
  let sessionId: string | null = null
  let occurredAt = 0
  let sampleCount = 0

  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    const record = parseRecord(line)
    if (!record) {
      continue
    }
    sessionId ??= readString(record.sessionId) ?? null
    const message = asRecord(record.message)
    const toolResult = asRecord(record.toolUseResult)
    const nativeUsage = record.type === 'assistant'
      ? asRecord(message?.usage)
      : asRecord(toolResult?.usage)
    if (!nativeUsage) {
      continue
    }
    const identity = readString(record.requestId)
      ?? readString(message?.id)
      ?? readString(record.uuid)
      ?? readString(toolResult?.agentId)
      ?? `${path}:${index}`
    const key = `${record.type === 'assistant' ? 'assistant' : 'tool-result'}:${identity}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    addUsage(usage, readClaudeUsage(nativeUsage))
    const timestamp = Date.parse(readString(record.timestamp) ?? '')
    if (Number.isFinite(timestamp)) {
      occurredAt = Math.max(occurredAt, timestamp)
    }
    sampleCount += 1
  }

  return sampleCount > 0 ? { sessionId, occurredAt, usage } : null
}

function readClaudeUsage(value: JsonRecord): RuntimeTokenUsageBreakdown {
  const directInput = readToken(value.input_tokens)
  const cacheWrite = readToken(value.cache_creation_input_tokens)
  const cacheRead = readToken(value.cache_read_input_tokens)
  const inputTokens = directInput + cacheWrite + cacheRead
  const outputTokens = readToken(value.output_tokens)
  return {
    inputTokens,
    cachedInputTokens: cacheRead,
    outputTokens,
    reasoningOutputTokens: 0,
    totalTokens: readOptionalToken(value.total_tokens) ?? inputTokens + outputTokens,
  }
}

function addUsage(target: RuntimeTokenUsageBreakdown, source: RuntimeTokenUsageBreakdown): void {
  target.inputTokens += source.inputTokens
  target.cachedInputTokens += source.cachedInputTokens
  target.outputTokens += source.outputTokens
  target.reasoningOutputTokens += source.reasoningOutputTokens
  target.totalTokens += source.totalTokens
}

function emptyUsage(): RuntimeTokenUsageBreakdown {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 }
}

function parseRecord(line: string): JsonRecord | null {
  if (!line.trim()) {
    return null
  }
  try {
    return asRecord(JSON.parse(line))
  }
  catch {
    return null
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' ? value as JsonRecord : null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readOptionalToken(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function readToken(value: unknown): number {
  return readOptionalToken(value) ?? 0
}
