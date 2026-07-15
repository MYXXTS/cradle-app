import { usageLogs } from '@cradle/db'

import { db } from '../../infra'
import type { RuntimeUsageEvent } from '../chat-runtime/runtime-provider-types'

export interface RuntimeUsageEventContext {
  event: RuntimeUsageEvent
  sessionId: string
  runId: string | null
  messageId: string | null
  providerTargetId: string | null
  providerSessionId: string
}

export function recordRuntimeUsageEvent(input: RuntimeUsageEventContext): 'inserted' | 'duplicate' {
  validateRuntimeUsageEventContext(input)
  const result = db()
    .insert(usageLogs)
    .values({
      id: input.event.id,
      runId: input.runId,
      sessionId: input.sessionId,
      messageId: input.messageId,
      providerTargetId: input.providerTargetId,
      providerSessionId: input.providerSessionId,
      providerThreadId: input.event.providerThreadId,
      providerTurnId: input.event.providerTurnId,
      modelId: input.event.modelId,
      promptTokens: input.event.usage.promptTokens,
      cachedInputTokens: input.event.usage.cachedInputTokens ?? 0,
      completionTokens: input.event.usage.completionTokens,
      reasoningOutputTokens: input.event.usage.reasoningOutputTokens ?? 0,
      totalTokens: input.event.usage.totalTokens,
      providerTotalPromptTokens: input.event.providerTotal.promptTokens,
      providerTotalCachedInputTokens: input.event.providerTotal.cachedInputTokens ?? 0,
      providerTotalCompletionTokens: input.event.providerTotal.completionTokens,
      providerTotalReasoningOutputTokens: input.event.providerTotal.reasoningOutputTokens ?? 0,
      providerTotalTokens: input.event.providerTotal.totalTokens,
      createdAt: input.event.occurredAt,
    })
    .onConflictDoNothing({ target: usageLogs.id })
    .run()
  return result.changes > 0 ? 'inserted' : 'duplicate'
}

function validateRuntimeUsageEventContext(input: RuntimeUsageEventContext): void {
  const requiredValues = {
    eventId: input.event.id,
    sessionId: input.sessionId,
    providerSessionId: input.providerSessionId,
    providerThreadId: input.event.providerThreadId,
    providerTurnId: input.event.providerTurnId,
    modelId: input.event.modelId,
  }
  const missing = Object.entries(requiredValues).find(([, value]) => !value)
  if (missing) {
    throw new Error(`Runtime usage event is missing required ${missing[0]}.`)
  }
  if (input.event.usage.totalTokens <= 0) {
    throw new Error('Runtime usage event requires a positive totalTokens value.')
  }
}
