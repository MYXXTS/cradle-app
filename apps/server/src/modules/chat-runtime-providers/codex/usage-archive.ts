import { readFile } from 'node:fs/promises'

import type { RuntimeTokenUsageBreakdown } from '@cradle/chat-runtime-contracts'

export interface CodexArchiveUsageSummary {
  sessionId: string | null
  occurredAt: number
  usage: RuntimeTokenUsageBreakdown
}

type JsonRecord = Record<string, unknown>

export async function readCodexArchiveUsage(path: string): Promise<CodexArchiveUsageSummary | null> {
  let content: string
  try {
    content = await readFile(path, 'utf8')
  }
  catch {
    return null
  }

  const lines = content.split(/\r?\n/u)
  let sessionId: string | null = null
  for (const line of lines) {
    const record = parseRecord(line)
    if (record?.type !== 'session_meta') {
      continue
    }
    const payload = asRecord(record.payload)
    sessionId = readString(payload?.id) ?? null
    break
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = parseRecord(lines[index])
    if (record?.type !== 'event_msg') {
      continue
    }
    const payload = asRecord(record.payload)
    const info = asRecord(payload?.info)
    const total = asRecord(info?.total_token_usage)
    const occurredAt = Date.parse(readString(record.timestamp) ?? '')
    if (payload?.type !== 'token_count' || !total || !Number.isFinite(occurredAt)) {
      continue
    }
    return {
      sessionId,
      occurredAt,
      usage: readCodexUsage(total),
    }
  }
  return null
}

function readCodexUsage(value: JsonRecord): RuntimeTokenUsageBreakdown {
  const inputTokens = readToken(value.input_tokens)
  const outputTokens = readToken(value.output_tokens)
  return {
    inputTokens,
    cachedInputTokens: readToken(value.cached_input_tokens),
    outputTokens,
    reasoningOutputTokens: readToken(value.reasoning_output_tokens),
    totalTokens: readOptionalToken(value.total_tokens) ?? inputTokens + outputTokens,
  }
}

function parseRecord(line: string | undefined): JsonRecord | null {
  if (!line?.trim()) {
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
