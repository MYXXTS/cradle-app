import type { UIMessageChunk } from 'ai'

import type { ChatStreamTransportResult } from '~/features/chat/transport/chat-stream-transport'

import {
  subscribeSyncChannel,
  unsubscribeSyncChannel,
  updateSyncSubscriptionCursor,
} from '../client'

export function subscribeSyncSessionRunChunks(input: {
  sessionId: string
  signal?: AbortSignal
}): Promise<ChatStreamTransportResult> {
  const subId = crypto.randomUUID()
  let closed = false
  let terminal = false

  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      const abort = () => {
        if (closed) {
          return
        }
        closed = true
        unsubscribeSyncChannel(subId)
        controller.close()
      }

      if (input.signal?.aborted) {
        abort()
        return
      }
      input.signal?.addEventListener('abort', abort, { once: true })

      subscribeSyncChannel(
        {
          op: 'sub',
          subId,
          channel: 'run-chunks',
          sessionId: input.sessionId,
          afterChunkSeq: -1,
        },
        (frame) => {
          if (closed || terminal) {
            return
          }
          if (!('kind' in frame)) {
            return
          }
          if (frame.kind === 'chunk') {
            controller.enqueue(frame.chunk)
            if (frame.terminal) {
              terminal = true
              closed = true
              unsubscribeSyncChannel(subId)
              controller.close()
            }
            if ('seq' in frame && typeof frame.seq === 'number') {
              updateSyncSubscriptionCursor(subId, frame.seq)
            }
            return
          }
          if (frame.kind === 'sub-ack') {
            updateSyncSubscriptionCursor(subId, frame.cursor)
            return
          }
          if (frame.kind === 'end') {
            closed = true
            unsubscribeSyncChannel(subId)
            if (frame.reason === 'error') {
              controller.error(new Error(frame.detail ?? 'Sync chunk stream failed'))
              return
            }
            controller.close()
          }
        },
      )
    },
    cancel() {
      if (closed) {
        return
      }
      closed = true
      unsubscribeSyncChannel(subId)
    },
  })

  return Promise.resolve({
    streamId: subId,
    sessionId: input.sessionId,
    runId: null,
    stream,
  })
}
