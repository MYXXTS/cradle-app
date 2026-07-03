import type { SessionEventSource } from '~/features/chat/session/session-sync-engine'

import {
  subscribeSyncChannel,
  unsubscribeSyncChannel,
  updateSyncSubscriptionCursor,
} from '../client'

export function createSyncSessionEventSource(input: {
  sessionId: string
  afterVersion: number
}): SessionEventSource {
  const subId = crypto.randomUUID()
  const sessionListeners = new Set<(event: MessageEvent<string>) => void>()
  const errorListeners = new Set<(event: Event) => void>()
  let closed = false

  subscribeSyncChannel(
    {
      op: 'sub',
      subId,
      channel: 'session-tail',
      sessionId: input.sessionId,
      afterVersion: input.afterVersion,
    },
    (frame) => {
      if (closed) {
        return
      }
      if (!('kind' in frame)) {
        return
      }
      if (frame.kind === 'tail-event') {
        updateSyncSubscriptionCursor(subId, readTailCursor(frame.event))
        const message = new MessageEvent('session', { data: JSON.stringify(frame.event) })
        for (const listener of sessionListeners) {
          listener(message)
        }
        return
      }
      if (frame.kind === 'end') {
        dispatchError()
      }
    },
  )

  return {
    addEventListener(type, listener) {
      if (type === 'session') {
        sessionListeners.add(listener as (event: MessageEvent<string>) => void)
        return
      }
      errorListeners.add(listener as (event: Event) => void)
    },
    close() {
      if (closed) {
        return
      }
      closed = true
      unsubscribeSyncChannel(subId)
      sessionListeners.clear()
      errorListeners.clear()
    },
  }

  function dispatchError(): void {
    const event = new Event('error')
    for (const listener of errorListeners) {
      listener(event)
    }
  }
}

function readTailCursor(event: { version?: number, sequenceId?: number }): number {
  if (typeof event.version === 'number') {
    return event.version
  }
  if (typeof event.sequenceId === 'number') {
    return event.sequenceId
  }
  return 0
}
