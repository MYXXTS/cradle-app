import type { UIMessage } from 'ai'

import type { RuntimeSession, RuntimeSettings } from './runtime-provider-types'

export interface LiveRuntimeNativeFollowUpInput {
  queueItemId: string
  message: UIMessage
}

export interface LiveRuntimeSessionRecord {
  sessionId: string
  runtimeKind: string
  providerTargetId: string | null
  readRuntimeSession: () => RuntimeSession
  updateRuntimeSettings: (settings: RuntimeSettings) => Promise<void>
  /**
   * When a long-lived provider query is alive during an active Cradle run, enqueue the
   * follow-up into the provider-native message queue (append, no interrupt). Throws if the
   * live query cannot accept input — callers must not treat the Cradle queue row as delivered.
   */
  enqueueNativeFollowUp?: (input: LiveRuntimeNativeFollowUpInput) => Promise<void>
  /**
   * Cancel a previously native-enqueued follow-up that has not been adopted by a Cradle run yet.
   * Returns true when the provider dropped it from its pending adopt list.
   */
  cancelNativeFollowUp?: (queueItemId: string) => Promise<boolean>
  /**
   * Claim a native follow-up for the next Cradle `streamTurn` so the provider adopts without
   * pushing the same content a second time. Returns true when the item was pending natively.
   */
  claimNativeFollowUp?: (queueItemId: string) => boolean
}

class LiveRuntimeSessionRegistry {
  private readonly records = new Map<string, LiveRuntimeSessionRecord>()

  /**
   * Register mutable provider state that outlives a Chat Runtime run. This is
   * deliberately separate from durable provider bindings: registration proves a
   * live provider object can accept controls without starting or resuming one.
   */
  register(record: LiveRuntimeSessionRecord): () => void {
    this.records.set(record.sessionId, record)
    let released = false
    return () => {
      if (released) {
        return
      }
      released = true
      if (this.records.get(record.sessionId) === record) {
        this.records.delete(record.sessionId)
      }
    }
  }

  read(sessionId: string): LiveRuntimeSessionRecord | undefined {
    return this.records.get(sessionId)
  }

  clear(): void {
    this.records.clear()
  }
}

export const liveRuntimeSessionRegistry = new LiveRuntimeSessionRegistry()
