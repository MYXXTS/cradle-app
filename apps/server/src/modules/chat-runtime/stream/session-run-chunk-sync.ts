import type { RunChunkResumeToken } from '@cradle/chat-runtime-contracts'

import { runRegistry } from '../run-registry'
import type {
  RunChunkReplay,
  SequencedRunChunkSubscriber,
} from './run-chunk-log'

export type SessionRunChunkSubscription
  = | { kind: 'not-found' }
    | { kind: 'snapshot-required' }
    | { kind: 'ready', replay: Extract<RunChunkReplay, { kind: 'ready' }>, unsubscribe: () => void }

export function openSessionRunChunkSubscription(
  sessionId: string,
  after: RunChunkResumeToken | undefined,
  subscriber: SequencedRunChunkSubscriber,
): SessionRunChunkSubscription {
  const runId = runRegistry.getActiveRunIdForSession(sessionId)
  if (!runId) {
    return after ? { kind: 'snapshot-required' } : { kind: 'not-found' }
  }
  const active = runRegistry.getActiveRun(runId)
  if (!active) {
    return after ? { kind: 'snapshot-required' } : { kind: 'not-found' }
  }
  if (after && after.runId !== runId) {
    return { kind: 'snapshot-required' }
  }

  const unsubscribe = active.runChunkLog.subscribe(subscriber)
  const replay = active.runChunkLog.replayAfter(after?.cursor)
  if (replay.kind === 'snapshot-required') {
    unsubscribe()
    return { kind: 'snapshot-required' }
  }
  return { kind: 'ready', replay, unsubscribe }
}
